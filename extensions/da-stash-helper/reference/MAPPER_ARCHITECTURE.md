# DA Stash Helper — Mapper Architecture

## What We Have Now

### 1. `DA_STASH_STRUCTURE.json` — Static Structure Map
- **What:** Comprehensive map of ALL DeviantArt stash DOM structure — every interaction chain, form element, selector, URL pattern
- **When generated:** Offline via Playwright (explore.ts) — runs once in a dev environment
- **Who uses it:** Developers building the extension — it's the "blueprint"
- **Scope:** Account-agnostic. Works for any DA user. Documents WHAT the UI looks like, not what's in it.

### 2. `da-stash-map.json` — Account-Specific Snapshot
- **What:** Full exploration output including actual form values, item counts, gallery names
- **When generated:** Offline via Playwright — specific to the test account
- **Who uses it:** Developers for testing/validation only
- **Scope:** Account-specific. NOT shipped with the extension.

---

## Mapper Types for the Extension

The extension itself needs **runtime mappers** — lightweight scripts that run inside the content script to capture live DOM state. These are DIFFERENT from the Playwright explorer (which is a dev tool). The runtime mappers use the selectors and patterns documented in `DA_STASH_STRUCTURE.json`.

### Mapper 1: `InitialLoadMapper` — First-Time Setup

**When:** Runs once when the extension is first installed (or when user clicks "Set up")

**Purpose:** Captures everything the extension needs to know about THIS user's account to populate its own UI.

**What it captures:**
| Data | Source | Used For |
|------|--------|----------|
| User's galleries (names, IDs, isPremium, isDefault) | `/studio/published/galleries` | Gallery dropdown in bulk edit, gallery assignment |
| Subscription tiers (names, IDs) | `/studio/published/galleries` | Tier dropdown in bulk edit, tier assignment |
| Preset templates | Edit → Preset template flow | Preset dropdown, auto-apply presets |
| Sidebar navigation links | `nav a, aside a` | Extension sidebar mirroring, quick navigation |
| Stash folder tree | `/stash/` folder links | Folder tree view, move-to-folder feature |
| Studio tabs | `[role="tablist"]` | Tab navigation shortcuts |
| User profile (username, avatar) | Sidebar profile link | Extension header, personalization |
| View mode preference | Grid/List toggle state | Maintain consistent view |

**Output:** Stored in `chrome.storage.local` as `userConfig`

**UI it powers:**
- Gallery dropdown in batch operations (populated with user's actual galleries)
- Tier dropdown for subscription tier assignment
- Preset template selector
- Folder tree navigation
- User profile display in extension popup

**Trigger:**
- First install → "Welcome! Let me learn your account..."
- Manual "Refresh Config" button in extension settings
- After user creates new gallery/tier (detected by StateChangeMapper)

---

### Mapper 2: `PageStateMapper` — Every Page Load

**When:** Runs on every stash page load / SPA navigation

**Purpose:** Captures the current page state so the extension knows what's on screen right now.

**What it captures:**
| Data | Source | Used For |
|------|--------|----------|
| Current page type (stash root, folder, gallery, submit page) | URL pattern matching | Context-aware UI, show/hide features |
| Items on current page (stash IDs, titles, thumbnails, tags, labels) | Item list parsing | Item management, bulk operations |
| Current selection state (which items are selected) | Checkbox states | Selection-aware toolbar |
| Current page number & total items | Pagination text "X-Y of Z" | Pagination controls, progress tracking |
| Current view mode (list/grid) | Toggle button state | Adapt extension UI to current mode |
| Current folder (if inside one) | URL + breadcrumb | Folder-aware operations |
| Toolbar state (base vs transformed) | Toolbar button detection | Sync extension UI with DA toolbar |
| Active form (if Edit/Tags/Description/etc is open) | Form element detection | Pre-fill extension forms, avoid conflicts |

**Output:** Stored in-memory (not persisted) as `pageState`, broadcast via `chrome.runtime.sendMessage`

**UI it powers:**
- Extension sidebar showing "527 items, page 1 of 11"
- Item list/grid in extension panel
- "Select All on This Page" / "Select All Across Pages"
- Context-sensitive action buttons

---

### Mapper 3: `MutationMapper` — Live DOM Changes

**When:** Always running via `MutationObserver` on the stash page

**Purpose:** Detects when DA's UI changes so the extension can react in real-time without re-scanning.

**What it watches:**
| Mutation | Detection Strategy | Extension Reaction |
|----------|-------------------|-------------------|
| Item selection changed | Checkbox `checked` attribute change | Update selection count, enable/disable bulk actions |
| Toolbar transformed (Edit/Tags/etc opened) | Toolbar child elements added/removed | Sync extension toolbar state, disable conflicting actions |
| Menu opened/closed | `[role="menu"]` added/removed from body | Show extension's version of menu options, or hide duplicate UI |
| Dialog appeared | `[role="dialog"]` added to body | Intercept confirmations, add "also do X" options |
| Page navigated (SPA) | URL change via `popstate`/`pushstate` | Re-run PageStateMapper |
| Items added/removed | Item list `childList` mutations | Update item count, refresh item list |
| View mode toggled | Grid/List button state change | Adapt extension UI layout |
| Toast/notification appeared | Snackbar/toast element added | Capture success/error status, update operation progress |

**Output:** Emits events via custom `EventTarget`:
```typescript
stashEvents.on('selectionChanged', (count: number) => { ... });
stashEvents.on('toolbarTransformed', (mode: 'edit-title' | 'edit-tags' | ...) => { ... });
stashEvents.on('dialogOpened', (type: 'confirm' | 'schedule' | ...) => { ... });
stashEvents.on('pageNavigated', (url: string) => { ... });
stashEvents.on('itemsChanged', (added: string[], removed: string[]) => { ... });
```

**UI it powers:**
- Real-time selection counter in extension panel
- Auto-sync extension state when user interacts with DA directly
- Smart action suggestions ("You selected 5 items — want to bulk edit tags?")
- Operation status tracking ("3/5 items updated successfully")

---

### Mapper 4: `RefreshMapper` — User-Triggered Rescan

**When:** User clicks "Refresh" in the extension UI

**Purpose:** Full rescan of current page state. Like PageStateMapper but more thorough — also rechecks user config that might have changed.

**What it captures:**
- Everything from PageStateMapper (current page items, selection, pagination)
- Diff against previous state (new items, removed items, changed labels)
- Quick gallery/tier check if currently on galleries page

**Output:**
- Updated `pageState`
- Diff report: "2 new items detected, 1 item now has 'Mature' label"

**UI it powers:**
- "Refresh" button with change summary
- Notification badge showing changes since last refresh

---

### Mapper 5: `CrossPageMapper` — Pagination Walker

**When:** User clicks "Select All (across pages)" or "Scan entire stash" in extension UI

**Purpose:** Walks through ALL pagination pages to build a complete stash inventory without the Playwright overhead.

**What it does:**
1. Captures current page items
2. Clicks "Next page" button
3. Waits for new items to load
4. Captures next page items
5. Repeats until last page
6. Returns to original page

**What it captures:**
| Data | Source | Used For |
|------|--------|----------|
| Complete item inventory (all stash IDs) | All pagination pages | "Select all 527 items" feature |
| Per-item metadata (title, tags, labels, date) | Item row parsing | Bulk filtering, smart search |
| Folder contents (recursive) | Folder navigation | Full stash tree |

**Output:** `fullInventory` stored in `chrome.storage.local` (cached, with timestamp)

**UI it powers:**
- "Select all 527 items across 11 pages"
- Smart search: "Find all items tagged 'watercolor'"
- Stash overview: "You have 527 items in 3 folders, 4 have Mature labels"
- Export stash metadata as CSV/JSON

---

### Mapper 6: `SubmitPageMapper` — Submit/Edit Dialog

**When:** Extension detects navigation to `/_deviation_submit/` page

**Purpose:** Captures the full submit page form state for pre-filling and automation.

**What it captures:**
| Data | Source | Used For |
|------|--------|----------|
| Current form values (title, tags, description, gallery, tier) | Form element values | Pre-fill from presets, display current state |
| Available galleries in dropdown | Gallery combobox options | Validate gallery assignments |
| Available tiers in dropdown | Tier combobox options | Validate tier assignments |
| Image/file metadata | Upload area state | Display file info |
| Maturity/AI/NoAI label states | Toggle states | Label management |
| Advanced settings state | Expandable sections | Full form control |

**Output:** `submitFormState` broadcast to extension popup/sidebar

**UI it powers:**
- Auto-fill from automation presets
- "Apply preset" button
- Form validation (check tags count, title length)
- One-click publish with preset values

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                 Extension Popup/Sidebar          │
│  ┌─────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ Gallery  │  │   Tier   │  │  Preset        │ │
│  │ Dropdown │  │ Dropdown │  │  Selector      │ │
│  └────┬─────┘  └────┬─────┘  └───────┬────────┘ │
│       │              │                │          │
│       └──────────────┼────────────────┘          │
│                      │                           │
│              UserConfig Store                    │
│         (chrome.storage.local)                   │
│                      ▲                           │
└──────────────────────┼───────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────┐
│                Content Script                     │
│                      │                           │
│  ┌───────────────────┼───────────────────────┐   │
│  │            Mapper Layer                    │   │
│  │                                            │   │
│  │  ┌──────────────┐  ┌────────────────────┐ │   │
│  │  │ InitialLoad  │  │  PageState         │ │   │
│  │  │ Mapper       │  │  Mapper            │ │   │
│  │  │ (once)       │  │  (every page)      │ │   │
│  │  └──────────────┘  └────────────────────┘ │   │
│  │                                            │   │
│  │  ┌──────────────┐  ┌────────────────────┐ │   │
│  │  │ Mutation     │  │  Refresh           │ │   │
│  │  │ Mapper       │  │  Mapper            │ │   │
│  │  │ (always on)  │  │  (on demand)       │ │   │
│  │  └──────────────┘  └────────────────────┘ │   │
│  │                                            │   │
│  │  ┌──────────────┐  ┌────────────────────┐ │   │
│  │  │ CrossPage    │  │  SubmitPage        │ │   │
│  │  │ Mapper       │  │  Mapper            │ │   │
│  │  │ (on demand)  │  │  (submit page)     │ │   │
│  │  └──────────────┘  └────────────────────┘ │   │
│  │                                            │   │
│  │  All mappers reference:                    │   │
│  │  DA_STASH_STRUCTURE.json (selectors,       │   │
│  │  patterns, URL matching)                   │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  ┌────────────────────────────────────────────┐   │
│  │          DOM Interaction Layer              │   │
│  │  (click, fill, wait — uses structure map)  │   │
│  └────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────┘
```

## Data Flow

```
1. INSTALL
   InitialLoadMapper → chrome.storage.local (userConfig)

2. PAGE LOAD
   PageStateMapper → in-memory pageState → broadcast to popup
   MutationMapper starts observing

3. USER INTERACTS WITH DA
   MutationMapper detects changes → emits events → update pageState

4. USER CLICKS "REFRESH"
   RefreshMapper → updated pageState + diff report

5. USER CLICKS "SELECT ALL ACROSS PAGES"
   CrossPageMapper → full inventory → chrome.storage.local

6. USER NAVIGATES TO SUBMIT PAGE
   SubmitPageMapper → form state → broadcast to popup

7. USER CREATES NEW GALLERY/TIER
   MutationMapper detects → triggers InitialLoadMapper re-run
```

## Selector Registry

All mappers share a common `SelectorRegistry` built from `DA_STASH_STRUCTURE.json`:

```typescript
// Generated from DA_STASH_STRUCTURE.json at build time
const selectors = {
  // Items
  itemCheckbox: 'input[type="checkbox"][aria-label="Select"]',
  itemLink: 'a[href*="/stash/0"]',
  folderLink: 'a[href*="/stash/2"]',

  // Toolbar
  selectAllCheckbox: () => { /* first checkbox in sticky div */ },
  dropdownTrigger: (name: string) => { /* button containing text */ },
  menuItem: '[role="menuitem"]',
  cancelButton: () => { /* button with text "Cancel" */ },
  saveButton: () => { /* button with text "Save Changes" */ },

  // Pagination
  nextPage: 'button[aria-label="Next page"]',
  prevPage: 'button[aria-label="Previous page"]',

  // Page detection
  isStashPage: (url: string) => url.includes('/stash/'),
  isSubmitPage: (url: string) => url.includes('/_deviation_submit/'),
  isGalleryPage: (url: string) => /\/studio\/published\/\d+/.test(url),
  isTierPage: (url: string) => /\/studio\/tier\/\d+/.test(url),
};
```

## Implementation Priority

| Priority | Mapper | Why First |
|----------|--------|-----------|
| 1 | PageStateMapper | Foundation — everything else depends on knowing page state |
| 2 | MutationMapper | Must react to DA changes in real-time |
| 3 | InitialLoadMapper | Populates user-specific dropdowns (galleries, tiers) |
| 4 | RefreshMapper | Simple to build on top of PageStateMapper |
| 5 | SubmitPageMapper | Needed for automation features |
| 6 | CrossPageMapper | Advanced feature — "select all across pages" |

## File Structure (proposed)

```
src/
├── content/
│   ├── mappers/
│   │   ├── index.ts              # Mapper orchestrator
│   │   ├── selector-registry.ts  # Shared selectors from structure map
│   │   ├── initial-load.ts       # InitialLoadMapper
│   │   ├── page-state.ts         # PageStateMapper
│   │   ├── mutation.ts           # MutationMapper
│   │   ├── refresh.ts            # RefreshMapper
│   │   ├── cross-page.ts         # CrossPageMapper
│   │   └── submit-page.ts        # SubmitPageMapper
│   ├── events/
│   │   └── stash-events.ts       # Custom event system
│   └── content-script.ts         # Entry point — initializes mappers
├── popup/
│   └── ...
├── background/
│   └── ...
└── types/
    ├── page-state.ts             # PageState interface
    ├── user-config.ts            # UserConfig interface
    └── stash-events.ts           # Event type definitions
```
