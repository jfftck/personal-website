import { Router, type IRouter } from "express";
import authRouter from "./auth";
import { contentApiRouter } from "./content";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(contentApiRouter);

export default router;
