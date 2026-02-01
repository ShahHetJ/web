'use client'
// ─────────────────────────────────────────────────────────────────────────────
// src/components/admin/AdminProductForm.tsx
//
// Single component that handles BOTH modes:
//   • product === null  →  CREATE  (POST / insert)
//   • product !== null  →  EDIT    (PUT  / update)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type FormEvent }    from 'react'
import { useRouter }                   from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import type { Product }                from '@/types/supabase'

// ── form state shape ────────────────────────────────────────────────────────
interface FormFields {
  name:        string
  description: string
  price:       string   // kept as string for <input type="number"> compatibility
  stock:       string
  image_url:   string
  category:    string
}

export default function AdminProductForm({
  product,
}: {
  product: Product | null
}) {
  const router  = useRouter()
  const supabase = createSupabaseBrowserClient()
  const isEdit  = product !== null

  // Pre-fill from existing product (or empty for create)
  const [form, setForm] = useState<FormFields>({
    name:        product?.name        ?? '',
    description: product?.description ?? '',
    price:       product?.price.toString() ?? '',
    stock:       product?.stock.toString() ?? '',
    image_url:   product?.image_url   ?? '',
    category:    product?.category    ?? '',
  })

  const [loading, setLoading] = useState(false)
  const [error,   setError  ] = useState<string | null>(null)

  // ── generic field updater ─────────────────────────────────────────────
  const setField = (key: keyof FormFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  // ── submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // ── local validation ──
    const price = parseFloat(form.price)
    const stock = parseInt(form.stock, 10)

    if (isNaN(price) || price < 0) {
      setError('Enter a valid price (≥ 0).')
      setLoading(false)
      return
    }
    if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      setError('Enter a valid stock quantity (integer ≥ 0).')
      setLoading(false)
      return
    }

    const payload = {
      name:        form.name.trim(),
      description: form.description.trim(),
      price,
      stock,
      image_url:   form.image_url.trim() || null,
      category:    form.category.trim(),
    }

    // ── upsert ────────────────────────────────────────────────────────
    let err: { message: string } | null = null

    if (isEdit) {
      const res = await supabase
        .from('products')
        .update(payload)
        .eq('id', product!.id)
      err = res.error
    } else {
      const res = await supabase
        .from('products')
        .insert(payload)
      err = res.error
    }

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // ── success → back to list ──
    router.push('/admin/products')
  }

  // ── render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif", color: 'var(--clr-text)' }}>
          {isEdit ? 'Edit Product' : 'Add Product'}
        </h1>
        <button onClick={() => router.push('/admin/products')}
                className="text-xs transition-colors"
                style={{ color: 'var(--clr-text-muted)' }}>
          ← Back
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border px-3 py-2 text-xs"
             style={{ background: 'rgba(248,113,113,0.08)',
                      borderColor: 'rgba(248,113,113,0.3)',
                      color: 'var(--clr-danger)' }}>
          {error}
        </div>
      )}

      {/* Form card */}
      <div className="rounded-2xl border p-6"
           style={{ background: 'var(--clr-surface)', borderColor: 'var(--clr-border)' }}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Name (full width) */}
            <div className="sm:col-span-2">
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--clr-text-muted)' }}>
                Product Name
              </label>
              <input type="text" required
                     value={form.name} onChange={setField('name')}
                     placeholder="Wireless Headphones"
                     className="w-full px-3 py-2.5 rounded-lg text-sm border"
                     style={{ background: 'var(--clr-bg)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' }} />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--clr-text-muted)' }}>
                Category
              </label>
              <input type="text" required
                     value={form.category} onChange={setField('category')}
                     placeholder="Electronics"
                     className="w-full px-3 py-2.5 rounded-lg text-sm border"
                     style={{ background: 'var(--clr-bg)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' }} />
            </div>

            {/* Price */}
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--clr-text-muted)' }}>
                Price (₹)
              </label>
              <input type="number" required min="0" step="0.01"
                     value={form.price} onChange={setField('price')}
                     placeholder="2999"
                     className="w-full px-3 py-2.5 rounded-lg text-sm border"
                     style={{ background: 'var(--clr-bg)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' }} />
            </div>

            {/* Stock */}
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--clr-text-muted)' }}>
                Stock Quantity
              </label>
              <input type="number" required min="0" step="1"
                     value={form.stock} onChange={setField('stock')}
                     placeholder="50"
                     className="w-full px-3 py-2.5 rounded-lg text-sm border"
                     style={{ background: 'var(--clr-bg)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' }} />
            </div>

            {/* Image URL (full width) */}
            <div className="sm:col-span-2">
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--clr-text-muted)' }}>
                Image URL <span style={{ color: 'var(--clr-text-dim)' }}>(optional)</span>
              </label>
              <input type="text"
                     value={form.image_url} onChange={setField('image_url')}
                     placeholder="https://picsum.photos/400"
                     className="w-full px-3 py-2.5 rounded-lg text-sm border"
                     style={{ background: 'var(--clr-bg)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' }} />
            </div>

            {/* Description (full width) */}
            <div className="sm:col-span-2">
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--clr-text-muted)' }}>
                Description
              </label>
              <textarea required rows={3}
                        value={form.description} onChange={setField('description')}
                        placeholder="Describe the product…"
                        className="w-full px-3 py-2.5 rounded-lg text-sm border resize-none"
                        style={{ background: 'var(--clr-bg)', borderColor: 'var(--clr-border)', color: 'var(--clr-text)' }} />
            </div>
          </div>

          {/* ── Footer buttons ── */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t"
               style={{ borderColor: 'var(--clr-border)' }}>
            <button type="button"
                    onClick={() => router.push('/admin/products')}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'var(--clr-surface-hover)', color: 'var(--clr-text-muted)' }}>
              Cancel
            </button>

            <button type="submit"
                    disabled={loading}
                    className="px-6 py-2 rounded-lg text-xs font-semibold text-white transition-colors
                               disabled:opacity-45 disabled:cursor-not-allowed"
                    style={{ background: 'var(--clr-accent)' }}>
              {loading
                ? 'Saving…'
                : isEdit
                  ? 'Update Product'
                  : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
