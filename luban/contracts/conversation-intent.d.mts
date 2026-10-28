export function chatDecision(text:unknown):'confirm'|'generate'|null;
export function wantsDraft(text:unknown):boolean;

export function bareActionQuestion(text: string, hasTarget?: boolean): string | null;

export function completeBareAction(text: string, pendingAction?: string): string | null;

export function preservesPage(text: string): boolean;

export function greetingReply(text: string): string | null;

export function conversationQuestion(text: string): boolean;
export function readOnlyInventory(text: string): boolean;

export function unresolvedReference(text: unknown, hasTarget?: boolean): boolean;

export function actionChoice(text: unknown): {first:string;second:string;start:number;end:number} | null;
export function resolveActionChoice(text: unknown, pendingChoice?: string): string | null;

export function requestsPageChange(text: unknown): boolean;

export function retainsGenerationRequest(text: unknown): boolean;
