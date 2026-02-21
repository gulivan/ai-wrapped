import type { FileCandidate } from "../discovery";
import { parseGeneric } from "./generic";

export const parseOpencode = async (candidate: FileCandidate) => parseGeneric(candidate, "opencode");
