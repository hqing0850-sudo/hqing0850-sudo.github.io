import type {
  CustomAsset,
  ExportBundle,
  Garment,
  GarmentPatch,
  NewGarmentInput,
  WashLog,
  WashStatus
} from '../types'

export interface WardrobeRepository {
  readonly kind: 'local' | 'cloud'
  listGarments(): Promise<Garment[]>
  createGarment(input: NewGarmentInput): Promise<Garment>
  updateGarment(id: string, patch: GarmentPatch, photo?: Blob | null): Promise<Garment>
  deleteGarment(id: string): Promise<void>
  setWashStatus(id: string, status: WashStatus): Promise<Garment>
  listLogs(): Promise<WashLog[]>
  clearLogs(): Promise<void>
  photoUrl(path: string | null): Promise<string | null>
  listCustomAssets(): Promise<CustomAsset[]>
  createCustomAsset(name: string, blob: Blob): Promise<CustomAsset>
  deleteCustomAsset(id: string): Promise<void>
  exportBundle(): Promise<ExportBundle>
  importBundle(bundle: ExportBundle): Promise<{ garments: number; logs: number }>
}

export function buildLog(garment: Garment, fromStatus: WashStatus | null, toStatus: WashStatus): WashLog {
  return {
    id: `${garment.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    itemId: garment.id,
    itemCode: garment.code,
    itemName: garment.name,
    category: garment.category,
    fromStatus,
    toStatus,
    at: Date.now()
  }
}
