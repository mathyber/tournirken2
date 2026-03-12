-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MatchResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matchId" INTEGER NOT NULL,
    "setByUserId" INTEGER NOT NULL,
    "player1Score" INTEGER NOT NULL,
    "player2Score" INTEGER NOT NULL,
    "info" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchResult_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MatchResult" ("createdAt", "id", "info", "isFinal", "matchId", "player1Score", "player2Score", "setByUserId") SELECT "createdAt", "id", "info", "isFinal", "matchId", "player1Score", "player2Score", "setByUserId" FROM "MatchResult";
DROP TABLE "MatchResult";
ALTER TABLE "new_MatchResult" RENAME TO "MatchResult";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
