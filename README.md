# Adventuria Itineraries (V1)

This is a **static website** you can deploy for free and share as a link.

## What you get
- Home page with a **list of trips**.
- Trip page: **3D globe**, China start view, city pins, day-by-day accordion, and a **presentation mode**.
- **/admin** editor (Decap CMS) with **Draft → Publish** workflow.
- **Place Finder** tool to search real POIs and copy coordinates into the editor.

## Deploy (Netlify, free)
1. Create a Git repository (GitHub is easiest).
2. Upload all files from this folder.
3. In Netlify: **New site from Git** → pick your repo → Deploy.
4. In Netlify: enable **Identity** and **Git Gateway**.
5. Open **/admin** and log in.

### Enable Identity + Git Gateway
- In Netlify: Site configuration → Identity → Enable Identity.
- Then enable **Git Gateway**.

> Note: Netlify Git Gateway is deprecated but still works for existing/new sites in many cases. If you prefer a longer-term solution later, we can migrate to a different auth/hosting approach.

## Editing content (no code)
- Open: `/admin`
- Edit `Trips Index` to add/remove trips.
- Edit the trip file (e.g., `China — Oct 2026`) to change cities, days, and places.

## Add a real attraction pin (no code)
1. Open `/tools/place-finder.html`
2. Search a place (e.g. "Forbidden City")
3. Click **Copy coords**
4. In `/admin` → Trip → Places → paste coordinates into `Longitude` and `Latitude`

## Notes about map/search usage
- Map tiles and geocoding use OpenStreetMap ecosystem services.
- Keep usage moderate and avoid bulk requests.
