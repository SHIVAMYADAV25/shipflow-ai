import { discoveryWorkflow } from "./discovery";
import { prdGenerationWorkflow } from "./prd";
import { taskGenerationWorkflow } from "./tasks";
import { prReviewWorkflow } from "./review";

export const functions = [discoveryWorkflow, prdGenerationWorkflow, taskGenerationWorkflow, prReviewWorkflow];
