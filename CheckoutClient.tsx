'use client'
// ─────────────────────────────────────────────────────────────────────────────
// src/components/checkout/CheckoutClient.tsx
//
// Flow:
//   1. User fills address + picks payment method.
//   2. On submit → POST /api/checkout/validate  (stock check + server total).
//   3. If valid  → INSERT order + order_items via the browser Supabase client.
//   4. Clear cart → redirect to /orders?new=<id>.
// ─────────────────────────────────────────────────────────────────────────────

import { useState }                    from 'react'
import { useRouter }                   from 'next/navigation'
import { useCart }                     from '@/context/CartContext'
import { createSupabaseBrowserClient } from '@/lib/supabase'

type PayMethod = 'cod' | 'upi'

interface Address {
  name:    string
  street:  string
  city:    string
  pincode: string
}

export default function CheckoutClient() {
  const { items, total, clearCart } = useCart()
  const router = useRouter()

  const [payment, setPayment] = useState<PayMethod>('cod')
  const [address, setAddress] = useState<Address>({ name: '', street: '', city: '', pincode: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState<string | null>(null)

  // If somehow the cart is empty, bounce back immediately
  if (items.length === 0) {
    router.replace('/')
    return null
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  const setField = (key: keyof Address) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setAddress((prev) => ({ ...prev, [key]: e.target.value }))

  // ── submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    // Basic address validation
    const { name, street, city, pincode } = address
    if (!name.trim() || !street.trim() || !city.trim() || !pincode.trim()) {
      setError('Please fill in all address fields.')
      setLoading(false)
      return
    }

    try {
      // ── Step 1: server-side stock + total validation ──────────────────
      const res = await fetch('/api/checkout/validate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Validation failed.')
        setLoading(false)
        return
      }

      // ── Step 2: create order row ──────────────────────────────────────
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('You must be signed in to place an order.')
        setLoading(false)
        return
      }

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          user_id:      user.id,
          total_amount: json.serverTotal,   // ← authoritative server price
          status:       'pending',
        })
        .select()
        .single()

      if (orderErr || !order) {
        setError('Failed to create order. Please try again.')
        setLoading(false)
        return
      }

      // ── Step 3: insert order_items ────────────────────────────────────
      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(
          items.map((i) => ({
            order_id:   order.id,
            product_id: i.product.id,
            quantity:   i.quantity,
            price:      i.product.price,
          }))
        )

      if (itemsErr) {
        setError('Failed to save order items.')
        setLoading(false)
        return
      }

      // ── Step 4: success ───────────────────────────────────────────────
      clearCart()
      router.push(`/orders?new=${order.id}`)
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6"
          style={{ fontFamily: "'Playfair Display', serif", color: 'var(--clr-text)' }}>
        Checkout
      </h1>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 rounded-lg border px-4 py-3 text-sm"
             style={{ background: 'rgba(248,113,113,0.08)',
                      borderColor: 'rgba(248,113,113,0.3)',
                      color: 'var(--clr-danger)' }}>
          {error}
        </div>
      )}

      {/* ── 1. Delivery address ── */}
      <section className="rounded-xl border p-5 mb-4"
               style={{ background: 'var(--clr-surface)', borderColor: 'var(--clr-border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--clr-text)' }}>
          Delivery Address
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { key: 'name'    as const, label: 'Full Name',      ph: 'Jane Doe'         },
            { key: 'pincode' as const, label: 'Pincode',        ph: '400001'           },
            { key: 'street'  as const, label: 'Street Address', ph: '123 Main St, Apt 4B' },
            { key: 'city'    as const, label: 'City',           ph: 'Mumbai'           },
          ]).map((f) => (
            <div key={f.key}>
              <label className="text-xs mb-1 block" style={{ color: 'var(--clr-text-muted)' }}>
                {f.label}
              </label>
              <input
                type="text"
                placeholder={f.ph}
                value={address[f.key]}
                onChange={setField(f.key)}
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{
                  background:   'var(--clr-bg)',
                  borderColor:  'var(--clr-border)',
                  color:        'var(--clr-text)',
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. Payment method ── */}
      <section className="rounded-xl border p-5 mb-4"
               style={{ background: 'var(--clr-surface)', borderColor: 'var(--clr-border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--clr-text)' }}>
          Payment Method
        </h2>

        <div className="flex gap-3">
          {(['cod', 'upi'] as PayMethod[]).map((method) => {
            const active = payment === method
            return (
              <button key={method}
                      onClick={() => setPayment(method)}
                      className="flex-1 p-4 rounded-lg border text-left transition-all"
                      style={{
                        borderColor: active ? 'var(--clr-accent)' : 'var(--clr-border)',
                        background:  active ? 'var(--clr-accent-dim)' : 'transparent',
                      }}>
                {/* radio dot */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                       style={{ borderColor: active ? 'var(--clr-accent)' : 'var(--clr-border)' }}>
                    {active && (
                      <div className="w-2 h-2 rounded-full"
                           style={{ background: 'var(--clr-accent)' }} />
                    )}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: 'var(--clr-text)' }}>
                    {method}
                  </span>
                </div>

                <p className="text-xs ml-6" style={{ color: 'var(--clr-text-muted)' }}>
                  {method === 'cod'
                    ? 'Pay cash when your order arrives.'
                    : 'Scan QR at delivery (placeholder).'}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 3. Order summary ── */}
      <section className="rounded-xl border p-5 mb-6"
               style={{ background: 'var(--clr-surface)', borderColor: 'var(--clr-border)' }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--clr-text)' }}>
          Order Summary
        </h2>

        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.product.id} className="flex justify-between text-sm">
              <span style={{ color: 'var(--clr-text-muted)' }}>
                {item.product.name}{' '}
                <span style={{ color: 'var(--clr-text-dim)' }}>×{item.quantity}</span>
              </span>
              <span className="font-medium" style={{ color: 'var(--clr-text)' }}>
                ₹{(item.product.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}

          {/* divider + total */}
          <div className="border-t pt-3 mt-2 flex justify-between"
               style={{ borderColor: 'var(--clr-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--clr-text)' }}>Total</span>
            <span className="text-lg font-bold"     style={{ color: 'var(--clr-text)' }}>
              ₹{total.toFixed(2)}
            </span>
          </div>
        </div>
      </section>

      {/* ── Place order ── */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-colors
                   disabled:opacity-45 disabled:cursor-not-allowed"
        style={{ background: 'var(--clr-accent)' }}
      >
        {loading ? 'Placing order…' : 'Place Order'}
      </button>
    </div>
  )
}
