import type { FileCandidate } from "../discovery";
import { parseGeneric } from "./generic";

export const parseGemini = async (candidate: FileCandidate) => parseGeneric(candidate, "gemini");
