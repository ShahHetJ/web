'use client'
// ─────────────────────────────────────────────────────────────────────────────
// src/context/CartContext.tsx
//
// • State lives in useReducer (no external store lib needed).
// • Hydrated from localStorage on first mount; written back on every change.
// • Quantities are clamped to product.stock client-side as a fast UX guard;
//   the real enforcement happens server-side in /api/checkout/validate.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react'
import type { CartItem, Product } from '@/types/supabase'

// ── State shape ───────────────────────────────────────────────────────────
interface State {
  items: CartItem[]
}

// ── Action union ──────────────────────────────────────────────────────────
type Action =
  | { type: 'ADD';        product: Product; quantity?: number }
  | { type: 'REMOVE';     productId: string }
  | { type: 'UPDATE_QTY'; productId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE';    items: CartItem[] }   // localStorage restore

const STORAGE_KEY = 'shopflow_cart_v1'

// ── Reducer ───────────────────────────────────────────────────────────────
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD': {
      const addQty  = action.quantity ?? 1
      const exist   = state.items.find((i) => i.product.id === action.product.id)

      const items = exist
        ? state.items.map((i) =>
            i.product.id === action.product.id
              ? { ...i, quantity: Math.min(i.quantity + addQty, action.product.stock) }
              : i
          )
        : [
            ...state.items,
            { product: action.product, quantity: Math.min(addQty, action.product.stock) },
          ]

      return { items }
    }

    case 'REMOVE':
      return { items: state.items.filter((i) => i.product.id !== action.productId) }

    case 'UPDATE_QTY': {
      // quantity <= 0  →  remove the item entirely
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.product.id !== action.productId) }
      }
      return {
        items: state.items.map((i) =>
          i.product.id === action.productId
            ? { ...i, quantity: Math.min(action.quantity, i.product.stock) }
            : i
        ),
      }
    }

    case 'CLEAR':
      return { items: [] }

    case 'HYDRATE':
      return { items: action.items }

    default:
      return state
  }
}

// ── Context ───────────────────────────────────────────────────────────────
interface CartContextValue {
  items:          CartItem[]
  itemCount:      number
  total:          number
  addItem:        (product: Product, qty?: number) => void
  removeItem:     (productId: string) => void
  updateQuantity: (productId: string, qty: number) => void
  clearCart:      () => void
}

const CartContext = createContext<CartContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [] })

  // Hydrate once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        dispatch({ type: 'HYDRATE', items: JSON.parse(raw) })
      }
    } catch {
      // Corrupt data — start fresh
    }
  }, [])

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
  }, [state.items])

  // Derived values
  const itemCount = state.items.reduce((s, i) => s + i.quantity, 0)
  const total     = state.items.reduce(
    (s, i) => s + i.product.price * i.quantity,
    0
  )

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        itemCount,
        total,
        addItem:        (product, qty)  => dispatch({ type: 'ADD',        product, quantity: qty }),
        removeItem:     (productId)     => dispatch({ type: 'REMOVE',     productId }),
        updateQuantity: (productId, qty)=> dispatch({ type: 'UPDATE_QTY', productId, quantity: qty }),
        clearCart:      ()              => dispatch({ type: 'CLEAR' }),
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart() must be called inside a <CartProvider>.')
  }
  return ctx
}
