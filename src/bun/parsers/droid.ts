import type { FileCandidate } from "../discovery";
import { parseGeneric } from "./generic";

export const parseDroid = async (candidate: FileCandidate) => parseGeneric(candidate, "droid");
