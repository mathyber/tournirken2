-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tournament" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nameId" INTEGER NOT NULL,
    "season" TEXT,
    "organizerId" INTEGER NOT NULL,
    "info" TEXT,
    "logo" TEXT,
    "maxParticipants" INTEGER NOT NULL,
    "onlyOrganizerSetsResults" BOOLEAN NOT NULL DEFAULT false,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "registrationStart" DATETIME,
    "registrationEnd" DATETIME,
    "tournamentStart" DATETIME,
    "tournamentEnd" DATETIME,
    "gridJson" TEXT,
    "swissRounds" INTEGER,
    "customSchema" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tournament_nameId_fkey" FOREIGN KEY ("nameId") REFERENCES "TournamentName" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Tournament" ("createdAt", "customSchema", "format", "gridJson", "id", "info", "logo", "maxParticipants", "nameId", "onlyOrganizerSetsResults", "organizerId", "registrationEnd", "registrationStart", "season", "status", "swissRounds", "tournamentEnd", "tournamentStart", "updatedAt") SELECT "createdAt", "customSchema", "format", "gridJson", "id", "info", "logo", "maxParticipants", "nameId", "onlyOrganizerSetsResults", "organizerId", "registrationEnd", "registrationStart", "season", "status", "swissRounds", "tournamentEnd", "tournamentStart", "updatedAt" FROM "Tournament";
DROP TABLE "Tournament";
ALTER TABLE "new_Tournament" RENAME TO "Tournament";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
