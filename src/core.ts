export type ApprovalKind = "erc20" | "erc721-single" | "erc721-all";

export type Approval = {
  chainId: number;
  token: string;
  owner: string;
  spender: string;
  kind: ApprovalKind;
  amount?: bigint;
  tokenId?: bigint;
  approved?: boolean;
  blockNumber: bigint;
  timestamp?: number;
  symbol?: string;
};

const MAX_UINT256 = (1n << 256n) - 1n;

export function isUnlimited(amount?: bigint): boolean {
  if (amount === undefined) return false;
  return amount >= MAX_UINT256 - (1n << 128n);
}

export function riskFlags(a: Approval, nowSec = Math.floor(Date.now() / 1000), staleDays = 90): string[] {
  const flags: string[] = [];
  if (a.kind === "erc20" && isUnlimited(a.amount)) flags.push("unlimited");
  if (a.kind === "erc721-all" && a.approved) flags.push("operator_all_tokens");
  if (a.timestamp && nowSec - a.timestamp >= staleDays * 86400) flags.push("stale");
  return flags;
}

function strip0x(v: string) { return v.toLowerCase().replace(/^0x/, ""); }
function pad64(v: string) { return v.padStart(64, "0"); }
function addressWord(address: string) { return pad64(strip0x(address)); }
function uintWord(v: bigint) { return pad64(v.toString(16)); }

export function revokeTxData(a: Approval): string {
  if (a.kind === "erc20") {
    return `0x095ea7b3${addressWord(a.spender)}${uintWord(0n)}`;
  }
  if (a.kind === "erc721-all") {
    return `0xa22cb465${addressWord(a.spender)}${uintWord(0n)}`;
  }
  if (a.tokenId === undefined) throw new Error("tokenId required for erc721-single");
  return `0x095ea7b3${pad64("0")}${uintWord(a.tokenId)}`;
}

export function dedupeLatest(items: Approval[]): Approval[] {
  const map = new Map<string, Approval>();
  for (const a of items) {
    const key = `${a.chainId}:${a.token.toLowerCase()}:${a.owner.toLowerCase()}:${a.spender.toLowerCase()}:${a.kind}:${a.tokenId ?? ""}`;
    const prior = map.get(key);
    if (!prior || a.blockNumber > prior.blockNumber) map.set(key, a);
  }
  return [...map.values()];
}