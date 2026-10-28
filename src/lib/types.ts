export const categories = ['Protecocho', 'Hidramax', 'Multicocho', 'Nutrisilo', 'Suínos'] as const
export type Category = (typeof categories)[number]
export const units = ['un', 'kg', 'm', 'L'] as const
export type Unit = (typeof units)[number] | ''
export type MovementType = 'entrada' | 'saida' | 'ajuste'

export interface Customer {
  id: string
  name: string
  document: string
  phone: string
  email: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CustomerForm {
  name: string
  document: string
  phone: string
  email: string
  notes: string
  active: boolean
}

export interface Product {
  id: string
  name: string
  sku: string
  imageUrl: string
  category: Category
  description: string
  unit: Unit
  quantity: number
  minStock: number
  stockKnown?: boolean
  location: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Movement {
  id: string
  productId: string
  type: MovementType
  quantity: number
  previousStock: number
  nextStock: number
  date: string
  user: string
  reason: string
  destination?: string
  reference?: string
  notes?: string
  customerId?: string
  customerName?: string
  isSale?: boolean
  batchId?: string
  importRowId?: string
  sourceOperationKey?: string
  effectiveAt?: string
}

export interface ImportBatch {
  id: string
  fileName: string
  fileFormat: 'xml' | 'zip' | 'pdf' | 'image' | 'csv' | 'xlsx' | 'xls' | 'txt' | 'json' | 'mixed'
  referenceStart: string
  referenceEnd: string
  status: 'review' | 'confirmed' | 'failed' | 'reversed'
  processedAt: string
  confirmedAt: string
  createdBy: string
  totalRows: number
  importedRows: number
  duplicateRows: number
  ignoredRows: number
  fileCount: number
  detectedFormats: string[]
  pendingRows: number
  invalidRows: number
  warnings: string[]
  errors: string[]
  createdAt: string
}

export interface ProductForm {
  name: string
  sku: string
  imageUrl: string
  category: Category
  description: string
  unit: Unit
  quantity: string
  minStock: string
  location: string
  active: boolean
}

export interface MovementForm {
  type: MovementType
  productId: string
  quantity: string
  reason: string
  destination: string
  reference: string
  notes: string
  customerId: string
  isSale: boolean
}
