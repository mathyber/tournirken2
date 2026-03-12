"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentFormat = exports.TournamentStatus = exports.Role = void 0;
var Role;
(function (Role) {
    Role["USER"] = "USER";
    Role["MODERATOR"] = "MODERATOR";
    Role["ADMIN"] = "ADMIN";
})(Role || (exports.Role = Role = {}));
var TournamentStatus;
(function (TournamentStatus) {
    TournamentStatus["DRAFT"] = "DRAFT";
    TournamentStatus["REGISTRATION"] = "REGISTRATION";
    TournamentStatus["ACTIVE"] = "ACTIVE";
    TournamentStatus["FINISHED"] = "FINISHED";
    TournamentStatus["CANCELLED"] = "CANCELLED";
})(TournamentStatus || (exports.TournamentStatus = TournamentStatus = {}));
var TournamentFormat;
(function (TournamentFormat) {
    TournamentFormat["SINGLE_ELIMINATION"] = "SINGLE_ELIMINATION";
    TournamentFormat["DOUBLE_ELIMINATION"] = "DOUBLE_ELIMINATION";
    TournamentFormat["ROUND_ROBIN"] = "ROUND_ROBIN";
    TournamentFormat["SWISS"] = "SWISS";
    TournamentFormat["MIXED"] = "MIXED";
})(TournamentFormat || (exports.TournamentFormat = TournamentFormat = {}));
//# sourceMappingURL=enums.js.map