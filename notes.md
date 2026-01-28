# Project Notes - Plapser

## Instructions for LLMs Reading This File

**CRITICAL RULES:**
1. **Save every thinking aspect in this file, labeled** - Document all reasoning, decisions, findings, and thought processes here with clear labels
2. **Do not assume. Check the web and correlation (or info) in the notes** - Verify information through web searches and cross-reference with existing notes before making assumptions
3. **No emojis, just please** - Keep all communication professional and emoji-free
4. **Do not go further, but do very extensive testing and check everything very carefully and extensively** - Focus on thorough testing and verification rather than adding new features
5. **Do not suggest new features, do not implement if that is not necessary** - Only implement what is explicitly requested and necessary

---

## PROJECT OVERVIEW

**Project Name:** Plapser
**Full Name:** Парсер расписания ВГЛТУ (Schedule Parser for VGLTU)
**Purpose:** Web application for obtaining class schedules for students and teachers of Voronezh State University of Forestry and Technologies in convenient formats
**License:** WTFPL (Do What The Fuck You Want To Public License)
**Main Language:** Russian (UI and documentation)
**Target University:** Воронежский государственный лесотехнический университет (VGLTU)

**Core Problem Solved:** The university's API (kis.vgltu.ru) returns data as HTML tables instead of structured data, making it inconvenient for mobile apps and calendar integration. This project parses the HTML and provides JSON and ICS formats.

---

## PROJECT STRUCTURE

### Root Directory Files
- `server.js` - Main Express server (456 lines) - PRIMARY SERVER FILE
- `server_ics.js` - Alternative ICS server implementation (134 lines) - NOT USED (legacy/alternative)
- `package.json` - Node.js dependencies and metadata
- `README.md` - Project documentation (385 lines)
- `plapser.service` - systemd service configuration file
- `install.sh` - Nextcloud plugin installation script
- `next_plugin.tar.gz` - Nextcloud plugin package
- `LICENSE` - License file

### Directory: `/parser/`
- `parseStudent.js` - Student schedule parser (184 lines)
- `parseTeacher.js` - Teacher schedule parser (125 lines)

### Directory: `/public/`
- `gui.html` - Main GUI interface - Link generator (157 lines)
- `gen.js` - JavaScript for GUI link generator (159 lines)
- `stylesheet.css` - Shared CSS stylesheet with dark/light theme support (303 lines)
- `searchStudent.html` - Student schedule search interface (444 lines)
- `searchTeacher.html` - Teacher location search interface (402 lines)

---

## TECHNICAL STACK

### Backend Technologies
- **Node.js** - Runtime environment (version 14+ required)
- **Express.js v5.1.0** - Web framework
- **Axios v1.8.4** - HTTP client for API requests
- **Cheerio v1.0.0** - HTML parsing (jQuery-like syntax)
- **ical-generator v8.1.1** - ICS calendar file generation
- **ics v3.8.1** - Alternative ICS library (used in server_ics.js, not main server)
- **CORS v2.8.5** - Cross-origin resource sharing
- **web-push v3.6.7** - Web push notifications (dependency, usage unclear)

### Frontend Technologies
- **Vanilla JavaScript (ES6+)** - No frameworks
- **CSS3 with CSS Variables** - Theme system using CSS custom properties
- **HTML5** - Semantic markup
- **localStorage API** - Theme preference persistence

### External Dependencies
- **kis.vgltu.ru** - University schedule API (source of data)
- **durka.su** - Production domain (configured in CORS)

---

## SERVER ARCHITECTURE (server.js)

### Configuration Constants
- `port = 3000` - Server listening port
- `TIMEZONE = "Europe/Moscow"` - Timezone for calendar events
- `CACHE_TTL = 3600000` - Cache TTL: 1 hour (1,000,000 milliseconds)
- `allowedTypes = Set(["json", "json-week", "ics", "ics-week"])` - Valid output formats
- `modernCalFormat = true` - ICS format flag (affects event summary format)
- `serveNextcloudPlugin = true` - Enable Nextcloud plugin serving
- `nextcloudPluginPath = './next_plugin.tar.gz'` - Plugin package path

### CORS Configuration
```javascript
origin: 'https://durka.su'
methods: ['GET', 'POST', 'OPTIONS']
allowedHeaders: ['Content-Type', 'Authorization']
```

### API Endpoints

#### GET `/gen` - Student Schedule Generation
**Purpose:** Generate schedule for student groups
**Parameters:**
- `group` (required) - Group name (e.g., "ИС2-244-ОБ")
- `type` (required) - Output format: "json", "json-week", "ics", "ics-week"
- `date` (optional) - Date in YYYY-MM-DD format
- `tomorrow` (optional) - "true" for tomorrow's schedule
- `subgroup` (optional) - Subgroup number (1 or 2)

**Logic Flow:**
1. Validates group and type parameters
2. Validates type against allowedTypes
3. Date handling:
   - If `tomorrow=true`: baseDate = today + 1 day
   - Else if `date` provided: validates format (YYYY-MM-DD), uses it
   - Else: baseDate = today
4. For JSON formats:
   - `json`: Single day, calls parseStudent once
   - `json-week`: 7 days, loops 7 times calling parseStudent
   - Returns JSON object with date keys
5. For ICS formats:
   - Creates ical-generator calendar
   - `ics`: Single day
   - `ics-week`: 7 days
   - Filters lessons with valid time format (contains "-")
   - Creates calendar events with:
     - Start/end times parsed from "HH:MM-HH:MM" format
     - Summary: lesson name + type (if modernCalFormat) + classroom
     - Description: teacher + subgroup info
     - Location: classroom
   - Returns ICS file with appropriate headers

**Response Headers (ICS):**
- Content-Type: text/calendar
- Content-Disposition: inline; filename=schedule[.ics|week.ics]
- Cache-Control: no-store
- X-Published-TTL: PT1H

**Error Handling:**
- 400: Missing parameters, bad type, bad date format
- 500: Parser errors, generic error message

#### GET `/gen_teach` - Teacher Schedule Generation
**Purpose:** Generate schedule for teachers
**Parameters:**
- `teacher` (required) - Teacher full name (e.g., "Иванов И.И.")
- `type` (required) - Output format: "json", "json-week", "ics", "ics-week"
- `date` (optional) - Date in YYYY-MM-DD format
- `tomorrow` (optional) - "true" for tomorrow's schedule

**Logic Flow:**
- Similar to `/gen` but uses parseTeacher instead of parseStudent
- No subgroup parameter (not applicable to teachers)
- ICS events use different field mapping:
  - Summary: lesson.subject or "Занятие"
  - Description: room + group + note
  - Location: room

#### GET `/api/groups` - Get All Groups List
**Purpose:** Retrieve cached list of all student groups
**Caching:** In-memory cache with 1-hour TTL
**Source:** `https://kis.vgltu.ru/list?type=Group`
**Response:** JSON array of group names (strings)
**Cache Implementation:**
- `groupsCache.data` - Array of groups
- `groupsCache.lastUpdated` - Timestamp
- Updates if `Date.now() - lastUpdated > CACHE_TTL`
- Filters: only strings, non-empty, trimmed

#### GET `/api/teachers` - Get All Teachers List
**Purpose:** Retrieve cached list of all teachers
**Caching:** In-memory cache with 1-hour TTL
**Source:** `https://kis.vgltu.ru/list?type=Teacher`
**Response:** JSON array of teacher names (strings)
**Cache Implementation:** Same as groups cache

#### GET `/searchTeach` - Simplified Teacher Search API
**Purpose:** Quick teacher location lookup for today
**Parameters:**
- `teacher` (required) - Teacher name
**Response:** JSON with today's schedule
**Format:**
```json
{
  "teacher": "Name",
  "date": "YYYY-MM-DD",
  "dayOfWeek": "день недели",
  "lessons": [
    {
      "time": "HH:MM-HH:MM",
      "subject": "Subject name",
      "room": "Room number",
      "group": "Group name",
      "note": "Additional info"
    }
  ],
  "totalLessons": number
}
```
**Filtering:** Only lessons with time containing "-", room, and group

#### GET `/gui` - Main GUI Page
**Purpose:** Serve gui.html file
**Response:** HTML file from `/public/gui.html`

#### GET `/searchStudent` - Student Search Page
**Purpose:** Serve searchStudent.html file
**Response:** HTML file from `/public/searchStudent.html`

#### GET `/searchTeacher` - Teacher Search Page
**Purpose:** Serve searchTeacher.html file
**Response:** HTML file from `/public/searchTeacher.html`

#### Nextcloud Plugin Routes (if serveNextcloudPlugin = true)
- `GET /next_plugin/next_plugin.tar.gz` - Download plugin package
- `GET /next_plugin/install.sh` - Download installation script

### Static File Serving
- `app.use(express.static(path.join(__dirname, 'public')))` - Serves all files from /public directory

### Helper Functions

#### `getDateOffset(offsetDays = 0, baseDate = null)`
**Purpose:** Calculate date with offset
**Parameters:**
- `offsetDays` - Number of days to offset (default: 0)
- `baseDate` - Base date string (YYYY-MM-DD) or null for today
**Returns:** Date string in YYYY-MM-DD format
**Logic:** Creates Date object, adds offset days, returns ISO date string

---

## PARSER MODULES

### parseStudent.js

**Function:** `parseStudent(date, group, subgroup = null)`
**Purpose:** Parse student group schedule from HTML
**Source URL:** `https://kis.vgltu.ru/schedule?date={date}&group={group}`

**Constants:**
- `VALID_LESSON_TYPES = Set(['лек.', 'пр.', 'лаб.'])` - Valid lesson type abbreviations
- `GROUP_REGEX = /^[А-ЯЁ]{2}\d-\d{3}-[А-ЯЁ]{2}$/` - Group name pattern (e.g., ИС2-244-ОБ)

**Parsing Logic:**
1. Fetches HTML from KIS API using axios
2. Loads HTML into Cheerio
3. Finds day blocks: `div.table > div[style="margin-bottom: 25px;"]`
4. For each day block:
   - Extracts date text and day of week
   - Converts Russian month names to numbers
   - Creates date key in YYYY-MM-DD format
   - Checks for "Нет пар" (no lessons) message
   - If no lessons, adds status object and skips
   - Parses table rows:
     - Identifies time cells by style="width:75px"
     - Tracks rowspan to detect subgroup blocks (rowspan=2)
     - Extracts lesson content from cells with style="width:auto"
     - Parses content elements:
       - Text nodes and `<br>` tags split content
       - `<a>` tags contain classroom links
       - Identifies lesson type (лек./пр./лаб.)
       - Extracts lesson name
       - Finds subgroup info (п.г.)
       - Finds group names (regex match)
       - Extracts teacher name (pattern: Фамилия И.О.)
   - Filters by subgroup if provided
   - Builds lesson objects with structure:
     ```javascript
     {
       time: "HH:MM-HH:MM",
       type: "лек" | "пр" | "лаб" | "",
       name: "Lesson name",
       subgroup: "1" | "2" | "",
       groups: [group, ...],
       classroom: "Room",
       teacher: "Name И.О."
     }
     ```

**Return Format:**
```javascript
{
  "YYYY-MM-DD": {
    date: "DD месяц YYYY",
    dayOfWeek: "день недели",
    lessons: [
      { time, type, name, subgroup, groups, classroom, teacher },
      ...
    ]
  }
}
```

**Error Handling:** Returns null on error, logs to console

### parseTeacher.js

**Function:** `parseTeacher(date, teacher)`
**Purpose:** Parse teacher schedule from HTML
**Source URL:** `https://kis.vgltu.ru/schedule?teacher={teacher}&date={date}`

**Validation:**
- Requires teacher parameter (throws Error if missing)
- Requires date parameter (throws Error if missing)

**Parsing Logic:**
1. Fetches HTML from KIS API using axios
2. Loads HTML into Cheerio
3. Finds day blocks: `.table > div`
4. For each day block:
   - Extracts date and day of week from first two divs
   - Converts Russian month names to numbers
   - Creates date key in YYYY-MM-DD format
   - Parses table rows:
     - Single cell: checks for "нет пар" (no lessons)
     - Two cells: time in first, content in second
     - Splits content by `<br>` tags
     - First line: subject name
     - Lines with "п.г.": subgroup info
     - Lines matching group pattern: group name
     - Extracts room from `<a>` tag link
   - Builds lesson objects:
     ```javascript
     {
       time: "HH:MM-HH:MM",
       subject: "Subject name",
       group: "Group name",
       room: "Room number",
       subgroup: "п.г. info" | null
     }
     ```

**Return Format:**
```javascript
{
  "YYYY-MM-DD": {
    date: "DD месяц YYYY",
    dayOfWeek: "день недели",
    lessons: [
      { time, subject, group, room, subgroup },
      ...
    ]
  }
}
```

**Error Handling:** Throws errors for missing parameters, returns result object

---

## FRONTEND PAGES

### gui.html - Main Link Generator

**Purpose:** Interactive interface for generating schedule API links
**Route:** `/gui`
**Language:** Russian

**Features:**
1. **Theme Toggle**
   - Button in top-right corner
   - Toggles between light/dark themes
   - Persists preference in localStorage
   - Icon changes: moon (light mode) / sun (dark mode)

2. **Navigation Links**
   - "Расписание для студентов" → `/searchStudent`
   - "А где препод?" → `/searchTeacher`

3. **Input Fields:**
   - Group/Teacher input (id: `group`)
     - Text input with autocomplete dropdown
     - Clear button (×)
     - Label changes based on mode
   - Subgroup input (id: `subgroup`)
     - Number input, min=1, max=2
     - Hidden in teacher mode
   - Date input (id: `date`)
     - Date picker
     - Disabled when "tomorrow" is checked
     - Defaults to today

4. **Mode Toggle:**
   - Checkbox (id: `mode-toggle`)
   - "Режим преподавателя" label
   - Switches between group and teacher modes
   - Changes label and shows/hides subgroup field

5. **Format Selection:**
   - Radio buttons (name: `type`)
   - Options:
     - `json` - JSON (один день)
     - `json-week` - JSON (неделя)
     - `ics` - ICS (один день)
     - `ics-week` - ICS (неделя)
   - Help buttons (?) with tooltips (not fully implemented)

6. **Options:**
   - "На завтра" checkbox (id: `tomorrow`)
   - Disables date input when checked

7. **Actions:**
   - "Сгенерировать" button (id: `generate`)
   - Generated link display (id: `generated-link`)
   - "Копировать" button (id: `copy-button`)

**JavaScript (gen.js):**
- Fetches groups/teachers from `/api/groups` and `/api/teachers`
- Implements autocomplete dropdown (id: `group-list`)
- Filters options as user types (max 10 results)
- Generates URLs:
  - Teacher mode: `https://api.durka.su/gen_teach?teacher={name}&type={type}`
  - Student mode: `https://api.durka.su/gen?group={name}&type={type}`
- Adds subgroup, date, tomorrow parameters as needed
- Copy to clipboard functionality
- Theme toggle with localStorage persistence

**Key Functions:**
- `fetchGroups()` - Load groups list
- `fetchTeachers()` - Load teachers list
- `updateDropdown()` - Filter and display autocomplete options
- `generateLink()` - Build API URL
- `copyLink()` - Copy to clipboard

### searchStudent.html - Student Schedule Search

**Purpose:** Search and display student group schedules
**Route:** `/searchStudent`
**Language:** Russian

**Features:**
1. **Input Fields:**
   - Group input with autocomplete (same as gui.html)
   - Subgroup input (1-2)
   - Date picker
   - "На завтра" checkbox

2. **Options:**
   - "Расписание на неделю" checkbox (id: `weekSchedule`)
   - When checked, requests `json-week` format

3. **Search Button:**
   - "Найти расписание" (id: `search-group`)
   - Calls `/gen` endpoint with appropriate parameters

4. **Results Display:**
   - Shows group name and date
   - Displays lessons in cards:
     - Time (bold, primary color)
     - Lesson name (badge)
     - Lesson type (badge)
     - Classroom (badge)
     - Teacher (badge)
     - Subgroup info
   - For week view: groups by day, shows total lessons count
   - "Нет занятий" message when empty

**JavaScript:**
- Similar autocomplete to gui.html
- `searchGroup()` - Fetches schedule from API
- `displayResults()` - Renders schedule cards
- Handles both single day and week views
- Filters out lessons without valid time format

### searchTeacher.html - Teacher Location Search

**Purpose:** Find where teacher is located (schedule)
**Route:** `/searchTeacher`
**Language:** Russian

**Features:**
1. **Input Fields:**
   - Teacher input with autocomplete
   - Date picker
   - "Получить данные на неделю" checkbox (id: `weekParsing`)

2. **Search Button:**
   - "Найти преподавателя" (id: `search-teacher`)
   - Calls `/gen_teach` endpoint

3. **Results Display:**
   - Shows teacher name and date
   - Displays lessons in cards:
     - Time
     - Subject name
     - Room (badge)
     - Group (badge)
     - Subgroup info
   - For week view: groups by day, shows total lessons count

**JavaScript:**
- Teacher autocomplete from `/api/teachers`
- `searchTeacher()` - Fetches teacher schedule
- `displayResults()` - Renders teacher schedule cards
- Handles both single day and week views

---

## STYLING (stylesheet.css)

### Theme System
**Implementation:** CSS Custom Properties (CSS Variables)
**Theme Toggle:** `[data-theme="dark"]` attribute on `<body>`

### Light Theme Variables
- `--primary: #7131c0` (Purple)
- `--primary-hover: #3b147e` (Dark purple)
- `--secondary: #0d7c71` (Teal)
- `--error: #b00020` (Red)
- `--text: #212121` (Dark gray)
- `--text-light: #666` (Gray)
- `--background: #fafafa` (Light gray)
- `--white: #fff`
- `--surface: #fff`
- `--border: #ccc`
- `--border-light: #e9ecef`
- `--shadow: rgba(0, 0, 0, 0.08)`

### Dark Theme Variables
- `--primary: #742dca` (Purple)
- `--primary-hover: #3b147e` (Dark purple)
- `--secondary: #307a73` (Teal)
- `--error: #cf6679` (Pink-red)
- `--text: #ffffff` (White)
- `--text-light: #b0b0b0` (Light gray)
- `--background: #121212` (Dark)
- `--white: #1e1e1e` (Dark surface)
- `--surface: #2d2d2d` (Dark gray)
- `--border: #404040` (Gray)
- `--border-light: #333333` (Dark gray)
- `--shadow: rgba(0, 0, 0, 0.3)`

### Key Components
- `.container` - Main content container (max-width: 600px, centered)
- `.input-group` - Form input wrapper with floating label
- `.input-field` - Text inputs with theme-aware styling
- `.input-label` - Floating labels
- `.dropdown` - Autocomplete dropdown list
- `.button` - Primary action buttons
- `.theme-toggle` - Fixed position theme toggle button
- `.lesson-card` - Schedule lesson display cards
- `.type-options` - Format selection radio buttons
- `.checkbox-container` - Checkbox wrapper

**Transitions:** All color changes use 0.3s ease transitions for smooth theme switching

---

## DEPLOYMENT

### Systemd Service (plapser.service)
**Location:** `/etc/systemd/system/plapser.service`
**Configuration:**
- ExecStart: `/root/n/bin/node /root/plapser/server.js`
- WorkingDirectory: `/root/plapser/`
- Restart: always
- Environment: NODE_ENV=production

**Installation:**
```bash
sudo cp plapser.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable plapser
sudo systemctl start plapser
```

### NGINX Reverse Proxy Configuration
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

### Nextcloud Plugin Installation
**Script:** `install.sh`
**Purpose:** Automated installation of Nextcloud plugin
**Process:**
1. Downloads plugin from `/next_plugin/next_plugin.tar.gz`
2. Extracts to `/var/www/html/custom_apps/plapser_calendar`
3. Sets permissions (www-data:www-data, 755)
4. Enables plugin via `occ app:enable`
5. Self-destructs after completion

**Usage:**
```bash
curl -L http://api.durka.su/next_plugin/install.sh | bash
```

---

## DATA FORMATS

### JSON Format (Single Day)
```json
{
  "2025-09-27": {
    "date": "27 сентября 2025",
    "dayOfWeek": "суббота",
    "lessons": [
      {
        "time": "13:40-15:10",
        "type": "лаб",
        "name": "Прикладные задачи программирования",
        "subgroup": "1",
        "groups": ["ИС2-244-ОБ"],
        "classroom": "104Комп/7к",
        "teacher": "Иванов И.И."
      }
    ]
  }
}
```

### JSON Format (Week)
```json
{
  "2025-09-27": { ... },
  "2025-09-28": { ... },
  "2025-09-29": { ... },
  ...
}
```

### ICS Format
- Standard iCalendar format
- Generated using ical-generator library
- Events include:
  - DTSTART/DTEND with timezone
  - SUMMARY (lesson name + type + classroom if modernCalFormat)
  - DESCRIPTION (teacher + subgroup)
  - LOCATION (classroom)
  - Timezone: Europe/Moscow

---

## KNOWN ISSUES AND LIMITATIONS

### Performance
- Week schedules make 7 separate API calls (commented TODO in code)
- No request batching or parallel processing
- Cache TTL is 1 hour (may be stale during schedule updates)

### Data Quality
- Depends on KIS API availability and format
- HTML parsing is fragile (may break if HTML structure changes)
- Group name regex may not match all group formats
- Teacher name parsing relies on specific format (Фамилия И.О.)

### Error Handling
- Generic error messages (500 errors)
- No retry logic for failed API calls
- Parser returns null on errors (may cause issues downstream)

### UI/UX
- Help tooltips in gui.html - implemented with hover functionality
- Theme icons use emojis (violates rule 3, but existing code)
- No loading indicators during API calls (except search pages)
- No error display in gui.html (only alerts)

### Code Quality
- `server_ics.js` exists but is not used (legacy code?)
- Some commented code in parser files
- Hardcoded URLs (api.durka.su in gen.js)
- Mixed Russian/English in code comments

---

## TESTING CHECKLIST

### Server Endpoints
- [ ] GET `/gen` with all parameter combinations
- [ ] GET `/gen_teach` with all parameter combinations
- [ ] GET `/api/groups` - verify caching
- [ ] GET `/api/teachers` - verify caching
- [ ] GET `/searchTeach` - verify response format
- [ ] Error handling for all endpoints
- [ ] CORS headers verification
- [ ] ICS file generation and format validation

### Parser Modules
- [ ] parseStudent with valid group and date
- [ ] parseStudent with subgroup filter
- [ ] parseStudent with "Нет пар" case
- [ ] parseStudent error handling (invalid group, network error)
- [ ] parseTeacher with valid teacher and date
- [ ] parseTeacher with "нет пар" case
- [ ] parseTeacher error handling
- [ ] Date format conversion (Russian months)
- [ ] Group name regex matching
- [ ] Lesson type detection
- [ ] Teacher name extraction

### Frontend Pages
- [ ] gui.html - all form interactions
- [ ] gui.html - autocomplete functionality
- [ ] gui.html - link generation (all formats)
- [ ] gui.html - copy to clipboard
- [ ] gui.html - theme toggle and persistence
- [ ] searchStudent.html - search functionality
- [ ] searchStudent.html - week view
- [ ] searchStudent.html - subgroup filtering
- [ ] searchTeacher.html - search functionality
- [ ] searchTeacher.html - week view
- [ ] All pages - theme consistency
- [ ] All pages - responsive design
- [ ] All pages - error handling

### Integration
- [ ] End-to-end: GUI → API → Parser → Response
- [ ] ICS file import into calendar applications
- [ ] JSON response parsing by external clients
- [ ] Cache invalidation and refresh
- [ ] Concurrent requests handling

---

## CONFIGURATION POINTS

### Server Configuration (server.js)
- Port number (line 10)
- Timezone (line 11)
- Cache TTL (line 246)
- CORS origin (line 31)
- modernCalFormat flag (line 15)
- serveNextcloudPlugin flag (line 18)
- nextcloudPluginPath (line 19)

### Parser Configuration
- VALID_LESSON_TYPES (parseStudent.js line 5)
- GROUP_REGEX pattern (parseStudent.js line 6)
- KIS API base URL (hardcoded in parsers)

### Frontend Configuration
- API base URL (hardcoded in gen.js line 130-131: "https://api.durka.su")
- Theme default (localStorage or 'light')
- Autocomplete result limit (10 items)

---

## EXTERNAL DEPENDENCIES

### KIS VGLTU API
**Base URL:** `https://kis.vgltu.ru`
**Endpoints Used:**
- `/schedule?date={date}&group={group}` - Student schedule
- `/schedule?teacher={teacher}&date={date}` - Teacher schedule
- `/list?type=Group` - Groups list
- `/list?type=Teacher` - Teachers list

**Response Format:** HTML tables
**Reliability:** May be slow, format may change

### Production Domain
**URL:** `https://durka.su` (configured in CORS)
**API URL:** `https://api.durka.su` (hardcoded in frontend)

---

## NOTES LOG

**2024-12-XX - Initial Notes Creation**
- Created notes.md file per user request
- Documented current project structure
- Analyzed gui.html file
- Established rules for future LLM interactions
- Identified areas requiring verification and testing

**2024-12-XX - Comprehensive Project Analysis**
- Read and analyzed all project files
- Documented complete server architecture
- Documented parser modules in detail
- Documented all frontend pages
- Documented styling system
- Documented deployment configuration
- Created comprehensive testing checklist
- Identified known issues and limitations
- Documented all API endpoints
- Documented data formats
- Documented configuration points
- Documented external dependencies

**2024-12-XX - Help Tooltips Fix**
- Fixed help tooltips functionality in gui.html
- Removed conflicting CSS hover rules that interfered with JavaScript
- Improved JavaScript tooltip logic:
  - Added show/hide with class toggle (.show class)
  - Added mouseenter/mouseleave handlers on both button and tooltip
  - Added 100ms delay on hide for smoother UX
  - Increased z-index to 100 for proper layering
  - Added pointer-events management (none by default, auto when shown)
- Changes made to: gui.html (tooltip event handlers), stylesheet.css (tooltip styles)

**2024-12-XX - Help Tooltips Fix**
- Fixed help tooltips functionality in gui.html
- Removed conflicting CSS hover rules that interfered with JavaScript
- Improved JavaScript tooltip logic:
  - Added show/hide with class toggle (.show class)
  - Added mouseenter/mouseleave handlers on both button and tooltip
  - Added 100ms delay on hide for smoother UX
  - Increased z-index to 100 for proper layering
  - Added pointer-events management (none by default, auto when shown)
- Changes made to: gui.html (tooltip event handlers), stylesheet.css (tooltip styles)

**2024-12-XX - Week Schedule API Optimization**
- Optimized week schedule requests to use single API call instead of 7
- Changed logic in server.js for both /gen and /gen_teach endpoints
- For json-week and ics-week types:
  - Single call to parseStudent/parseTeacher with baseDate
  - Parser returns all days from API response (already supported)
  - Return ALL days from API response (no filtering to 7 days)
  - API may return more or fewer days depending on what's available
- For single day requests (json, ics): unchanged behavior
- Parsers (parseStudent.js, parseTeacher.js) unchanged - they already parse multiple days from one response
- Changes made to: server.js only (4 locations: json-week student, ics-week student, json-week teacher, ics-week teacher)
- Performance improvement: 7 API calls → 1 API call for week schedules
- Behavior change: Returns all available days from API, not limited to exactly 7 days

**2024-12-XX - Recent Teachers Feature**
- Added cookie-based storage for recent teacher searches
- Saves last 6 searched teachers in cookies
- Displays 6 quick access buttons (3 per row) below search button
- Buttons show teacher names, clicking button fills input and triggers search
- Cookie name: 'recent_teachers', stored as JSON array
- Cookie expiration: 365 days
- Features:
  - Auto-saves teacher name after successful search
  - Removes duplicates (moves to top if already exists)
  - Limits to 6 most recent
  - Buttons styled with theme support
  - Grid layout: 3 columns
- Changes made to: searchTeacher.html (CSS, HTML, JavaScript)
- Functions added: getCookie, setCookie, saveRecentTeacher, getRecentTeachers, displayRecentTeachers

**2024-12-XX - Detailed Logging System**
- Added comprehensive request logging middleware
- Logs all requests with detailed information:
  - Timestamp (ISO format)
  - Client IP (with reverse proxy support: X-Forwarded-For, X-Real-IP)
  - HTTP method and path
  - Query parameters (JSON)
  - Response status code
  - Response time in milliseconds
  - User-Agent string
  - Device type (mobile/tablet/desktop)
  - Browser (chrome/firefox/safari/edge/opera)
  - OS (windows/macos/linux/android/ios)
  - Referer
  - Response size in bytes
- Logs output as JSON for easy parsing
- Reverse proxy support: extracts real client IP from X-Forwarded-For or X-Real-IP headers
- Changes made to: server.js (logging middleware, helper functions)
- Functions added: getClientIP, parseUserAgent, logRequest

**2024-12-XX - Schedule Caching**
- Added in-memory cache for schedule data
- Cache TTL: 2 hours (7200000 ms)
- Cache key format: "student:group:date:subgroup" or "teacher:name:date"
- Automatic cache cleanup when size exceeds 1000 entries
- Caching applied to all schedule endpoints:
  - /gen (json, json-week, ics, ics-week)
  - /gen_teach (json, json-week, ics, ics-week)
- Reduces API calls to KIS and improves response times
- Changes made to: server.js (cache functions and integration)
- Functions added: getScheduleCacheKey, getCachedSchedule, setCachedSchedule

**2024-12-XX - Recent Groups Feature**
- Added cookie-based storage for recent group searches (symmetric to teachers)
- Saves last 6 searched groups in cookies
- Displays 6 quick access buttons (3 per row) below search button
- Buttons show group names, clicking button fills input and triggers search
- Cookie name: 'recent_groups', stored as JSON array
- Cookie expiration: 365 days
- Features identical to recent teachers feature
- Changes made to: searchStudent.html (CSS, HTML, JavaScript)
- Functions added: getCookie, setCookie, saveRecentGroup, getRecentGroups, displayRecentGroups

**2024-12-XX - Client-Side Logging and Cache Headers**
- Added cache information headers to server responses:
  - X-Cache-Hit: 'true' or 'false'
  - X-Cache-Age: age of cached data in seconds
  - X-Cache-TTL: remaining TTL in seconds
- Modified getCachedSchedule to return cache metadata (hit, age, TTL)
- Added setCacheHeaders function to set cache headers in responses
- Added client-side logging in searchStudent.html and searchTeacher.html:
  - Logs request timing (start to finish in milliseconds)
  - Logs cache hit/miss status
  - Logs cache age and TTL
  - Logs request parameters (group/teacher, date, type)
  - Logs status code and URL
  - Logs errors with timing information
- Logs output to browser console as JSON with [CLIENT LOG] prefix
- Uses performance.now() for high-precision timing
- Changes made to: server.js (cache headers), searchStudent.html (logging), searchTeacher.html (logging)

**2024-12-XX - PWA (Progressive Web App) Support**
- Added PWA support for offline functionality and app installation
- Created manifest.json with app metadata:
  - App name, short name, description
  - Start URL: /gui
  - Display mode: standalone
  - Theme color: #7131c0
  - Icons: 192x192 and 512x512 (created)
- Created service-worker.js for offline caching:
  - Caches static files (HTML, CSS, JS)
  - Caches API responses (/gen, /gen_teach, /api/)
  - Network-first strategy for API (falls back to cache when offline)
  - Cache-first strategy for static files
  - Adds X-Offline-Cache header when serving from cache
  - Cache TTL: 15 hours
- Added offline indicator:
  - Fixed position banner showing "Нет подключения к интернету"
  - Appears when navigator.onLine is false
  - Styled with error color
- Added cache warning banner:
  - Orange warning box displayed when data comes from offline cache
  - Shows message: "⚠️ Данные из офлайн кэша"
  - Warns that data may be outdated
  - Appears in results when X-Offline-Cache header is present
- Service Worker registration in all HTML pages:
  - gui.html, searchStudent.html, searchTeacher.html
  - Automatic registration on page load
- Changes made to:
  - manifest.json (new file)
  - service-worker.js (new file)
  - gui.html (manifest link, service worker registration)
  - searchStudent.html (manifest link, offline indicator, cache warning, service worker)
  - searchTeacher.html (manifest link, offline indicator, cache warning, service worker)
- Icon files created: icon-192.png and icon-512.png

**2024-12-XX - Advanced PWA Caching and Background Updates**
- Extended recent searches from 6 to 12 items (both groups and teachers)
- Added IndexedDB for cache metadata storage:
  - Stores timestamp for each cached request
  - Tracks when data was last updated
  - Database: 'plapser-cache-metadata'
- Background cache updates:
  - Updates recent 12 items automatically
  - Runs every hour while Service Worker is active
  - Runs on app open
  - Runs when internet connection is restored
  - Updates synchronously, one item at a time
- Cache limits and cleanup:
  - Maximum 10 cached groups (FIFO - oldest removed first)
  - Maximum 20 cached teachers (FIFO - oldest removed first)
  - Automatic cleanup when limits exceeded
- Update time display:
  - Shows after search button, small font
  - Format: "N минут назад" or "N часов назад" or exact timestamp
  - Red color if data older than 2 hours
  - Shows timestamp from cache metadata
- Background update progress:
  - Fixed position at bottom of page
  - Shows current item being updated
  - Shows total time when complete
  - Only visible during update process
  - Debugging-style appearance (small font, minimal styling)
- Cache metadata in responses:
  - X-Cache-Timestamp header added to cached responses
  - Used to display update time on client
- Changes made to:
  - service-worker.js (IndexedDB, background updates, metadata storage)
  - searchStudent.html (update time display, progress indicator, background update triggers)
  - searchTeacher.html (update time display, progress indicator, background update triggers)
- Features:
  - Silent background updates (no notifications)
  - Updates prioritize recent items first
  - Works offline with cached data
  - Automatic cache refresh when online

---

## CRITICAL CODE PATTERNS

### Date Handling
- Always uses YYYY-MM-DD format internally
- Converts from Russian month names in parsers
- Uses `getDateOffset()` helper for date calculations
- Handles "tomorrow" flag separately from date parameter

### Error Responses
- 400: Bad request (missing params, invalid format)
- 500: Server error (parser failures, generic errors)
- Error messages are user-friendly but generic

### Caching Strategy
- In-memory cache for groups/teachers lists
- 1-hour TTL
- No cache for schedule data (always fresh)
- Cache updates on-demand when expired

### ICS Generation
- Uses ical-generator library (not ics library in main server)
- Filters lessons with valid time format
- Creates events with proper timezone
- modernCalFormat flag affects summary format

---

## IMPORTANT REMINDERS FOR LLMs

1. **Always check notes.md first** before making assumptions
2. **Verify API endpoints** match documented behavior
3. **Test parser changes** with actual KIS API responses
4. **Check date format conversions** (Russian months)
5. **Validate group name patterns** against GROUP_REGEX
6. **Consider cache TTL** when testing list endpoints
7. **Test both light and dark themes** for UI changes
8. **Verify ICS file format** with calendar applications
9. **Check CORS configuration** for cross-origin requests
10. **Test error cases** (invalid groups, network failures)

---

END OF NOTES
