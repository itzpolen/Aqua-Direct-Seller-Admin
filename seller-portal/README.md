# AquaDirect Seller Portal

A responsive React and TypeScript web app for station owners to create a seller account, register a station, submit verification documents, configure delivery coverage and hours, and manage water types, refill and new-gallon pricing, and inventory.

## Requirements

- Node.js 20.19+ or 22.12+
- A Supabase project with `supabase/schema.sql` applied
- The schema's catalog seeds, station-document requirements, storage buckets, and seller RLS policies

## Local setup

From this directory:

```sh
npm install
```

Copy `.env.example` to `.env.local`, then set:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_GEOCODER_URL=https://nominatim.openstreetmap.org
VITE_GEOCODER_EMAIL=you@example.com
VITE_MAP_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

The geocoder URL, contact email, and tile URL are optional; these defaults use the public OpenStreetMap services for development and low-volume use. The contact email is sent as a Nominatim request parameter and is visible to users of the frontend. For production traffic, configure a provider that supports the required volume and browser access (including CORS). Never put a Supabase service-role key or PayMongo secret in a `VITE_*` variable.

Start the development server:

```sh
npm run dev
```

Build and type-check:

```sh
npm run build
```

## Seller workflow

1. Create an account and confirm the email if Supabase Auth requires it.
2. Register the business identity and contact details, choose a province, city or municipality, and barangay from the dependent Philippine Standard Geographic Code (PSGC) lists, then enter the street address and coordinates. Use the current-location button while at the station or enter coordinates manually.
3. Add or replace the station photo and save a customer-facing station description from the seller dashboard. Images are stored in the public `station-assets` bucket and the selected image path is saved as the station logo; the description uses the existing `stations.description` column.
4. Configure the delivery radius, delivery fee, minimum order, and at least one valid weekly operating day.
5. Add a water type, then set refill and optional new-gallon prices separately for each offered size (Regular 18.9 L or Slim 11.3 L), along with starting stock. Use the stock adjustment action for later inventory changes so the inventory ledger stays accurate.
6. Upload every required verification document. A business permit requires a future expiry date.
7. Submit the application for AquaDirect review. The submission checklist identifies incomplete profile, water pricing, delivery, policy, or document requirements and links to the page that needs attention. Customers see active water options only after the station is approved and published.

Station publication and application approval remain administrator-controlled. Keep Supabase Row Level Security enabled; the portal uses the authenticated user's access and does not bypass database policies.
