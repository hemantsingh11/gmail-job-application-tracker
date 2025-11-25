import type { Container } from '@azure/cosmos';

export interface GmailState {
  lastInternalDateMs?: number;
}

interface UserDoc {
  id: string;
  userid: string;
  gmailTokens?: Record<string, unknown>;
  gmailState?: GmailState;
}

let usersContainer: Container | null = null;

export function setUserContainer(container: Container): void {
  usersContainer = container;
}

function requireContainer(): Container {
  if (!usersContainer) {
    throw new Error('Users container not configured for Gmail state.');
  }
  return usersContainer;
}

function normalizeOwner(ownerEmail: string): string {
  if (!ownerEmail) {
    throw new Error('Owner email required for gmail state');
  }
  return ownerEmail.trim().toLowerCase();
}

export async function loadState(ownerEmail: string): Promise<GmailState | null> {
  const container = requireContainer();
  const pk = normalizeOwner(ownerEmail);
  try {
    const { resource } = await container.item(pk, pk).read<UserDoc>();
    return (resource && resource.gmailState) || null;
  } catch (err: any) {
    if (err.code === 404) {
      return null;
    }
    throw err;
  }
}

export async function saveState(ownerEmail: string, partial: GmailState = {}): Promise<GmailState> {
  const container = requireContainer();
  const pk = normalizeOwner(ownerEmail);

  let existingDoc: UserDoc | null = null;
  try {
    const { resource } = await container.item(pk, pk).read<UserDoc>();
    existingDoc = resource || null;
  } catch (err: any) {
    if (err.code !== 404) {
      throw err;
    }
  }

  const currentState = (existingDoc && existingDoc.gmailState) || {};
  const nextState = { ...currentState, ...partial };

  const doc: UserDoc = {
    id: pk,
    userid: pk,
    gmailState: nextState,
  };

  if (existingDoc && existingDoc.gmailTokens) {
    doc.gmailTokens = existingDoc.gmailTokens;
  }

  await container.items.upsert(doc);
  return nextState;
}
