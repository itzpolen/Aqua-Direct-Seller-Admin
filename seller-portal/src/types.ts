export interface StationApplication {
  id: string;
  owner_id: string;
  legal_business_name: string;
  display_name: string;
  phone: string;
  email: string | null;
  address_line: string;
  barangay: string | null;
  city: string;
  province: string;
  region: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  application_status: string;
  verification_status: string;
  submitted_at: string | null;
  created_at: string;
}

export interface Station {
  id: string;
  application_id: string;
  display_name: string;
  description: string | null;
  logo_path: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  service_radius_km: number | null;
  verification_status: string;
  publication_status: string;
  operational_status: string;
  default_delivery_fee: number;
  minimum_order_amount: number;
  rating_average: number;
  rating_count: number;
}

export interface StationOperatingHour {
  id?: string;
  station_id: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
}

export interface StationRider {
  id: string;
  station_id: string;
  rider_number: number;
  name: string;
  phone: string;
}

export interface WaterType {
  id: string;
  name: string;
  description: string | null;
}

export interface ContainerType {
  id: string;
  name: string;
  volume_liters: number | null;
  description: string | null;
}

export interface StationProduct {
  id: string;
  station_id: string;
  water_type_id: string;
  container_type_id: string;
  name: string;
  description: string | null;
  refill_available: boolean;
  refill_price: number;
  new_container_available: boolean;
  new_container_price: number | null;
  deposit_amount: number | null;
  requires_empty_container: boolean | null;
  return_policy: string | null;
  stock_quantity: number | null;
  max_order_quantity: number;
  status: "draft" | "active" | "inactive";
  image_path: string | null;
  images?: StationProductImage[];
  created_at: string;
}

export interface StationProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}

export interface DocumentRequirement {
  application_id: string;
  document_type: string;
  required: boolean;
}

export interface StationDocument {
  id: string;
  application_id: string;
  document_type: string;
  storage_path: string;
  review_status: string;
  review_notes: string | null;
  required_for_verification: boolean;
  is_current: boolean;
  expires_at: string | null;
  submitted_at: string;
}
