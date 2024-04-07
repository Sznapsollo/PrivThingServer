const { Router } = require("express");
const router = Router();

const { handleAction } = require("../controllers/actions");

router.post("/", handleAction);

module.exports = router;
