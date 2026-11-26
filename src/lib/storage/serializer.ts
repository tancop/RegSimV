import type { SavedProgram } from "./savedProgram";

export interface Serializer {
  import(saved: string): SavedProgram;
  export(program: SavedProgram): string;
}
