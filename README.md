# NFC Attendance Marking System

CS4473 Mobile Computing group research project. Students' Android phones act as contactless NFC cards (Host Card Emulation), and the lecturer's phone reads them to record class attendance.

- **Host app** (teacher, React Native + Kotlin NFC reader): classes, enrol-by-tap, session calendar, live check-in, analytics
- **Student app** (React Native + Kotlin HCE service): classes, 30-minute push reminders, tap to check in
- **Backend** (Next.js + PostgreSQL): auth, data, reminders, analytics

## Documentation

- [Phase 1 plan](docs/PLAN.md): architecture, stack, data model, features, analytics, experiment design, milestones, risks
- [Identity, NFC protocol & auth](docs/IDENTITY_AND_AUTH.md): how students are told apart, APDU protocol, teacher and student authentication
- [API reference](docs/API.md): all REST endpoints and push message types
