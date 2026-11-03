"use strict";

// Legacy file-management endpoints were retired when the content library moved
// to the authenticated /api/content routes and public /files delivery.
module.exports = function retiredLegacyAdmin(_req, res) {
  res.status(410).json({ error: "This legacy endpoint has been retired." });
};
