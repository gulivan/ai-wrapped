import type { FileCandidate } from "../discovery";
import { parseGeneric } from "./generic";

export const parseCopilot = async (candidate: FileCandidate) => parseGeneric(candidate, "copilot");
