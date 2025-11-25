import type { Container } from '@azure/cosmos';

interface UserDoc {
  id: string;
  userid: string;
  gmailTokens?: Record<string, unknown>;
  gmailState?: Record<string, unknown>;
}

let usersContainer: Container | null = null;

export function setUserContainer(container: Container): void {
  usersContainer = container;
}

function requireContainer(): Container {
  if (!usersContainer) {
    throw new Error('Users container not configured for token store.');
  }
  return usersContainer;
}

function normalizeOwner(ownerEmail: string): string {
  if (!ownerEmail) {
    throw new Error('Owner email required for token store');
  }
  return ownerEmail.trim().toLowerCase();
}

export async function loadTokens(ownerEmail: string): Promise<Record<string, unknown> | null> {
  const container = requireContainer();
  const pk = normalizeOwner(ownerEmail);
  try {
    const { resource } = await container.item(pk, pk).read<UserDoc>();
    return (resource && resource.gmailTokens) || null;
  } catch (err: any) {
    if (err.code === 404) {
      return null;
    }
    throw err;
  }
}

export async function saveTokens(
  ownerEmail: string,
  newTokens: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
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

  const existingTokens = (existingDoc && existingDoc.gmailTokens) || {};
  const merged = { ...existingTokens, ...newTokens };

  const doc: UserDoc = {
    id: pk,
    userid: pk,
    gmailTokens: merged,
  };

  if (existingDoc && existingDoc.gmailState) {
    doc.gmailState = existingDoc.gmailState;
  }

  await container.items.upsert(doc);
  return merged;
}

export async function listOwners(): Promise<string[]> {
  const container = requireContainer();
  try {
    const { resources } = await container.items
      .query<{ userid: string }>({
        query: 'SELECT c.userid FROM c WHERE IS_DEFINED(c.gmailTokens)',
      })
      .fetchAll();

    return Array.from(
      new Set(
        (resources || []).map((item) => (item && item.userid ? String(item.userid).toLowerCase() : '')).filter(Boolean)
      )
    );
  } catch (err: any) {
    console.error('Failed to list Gmail owners from Cosmos', err.message || err);
    return [];
  }
}
