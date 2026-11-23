import { Router, type IRouter } from "express";
import { contentApiRouter } from "./content";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contentApiRouter);

export default router;
