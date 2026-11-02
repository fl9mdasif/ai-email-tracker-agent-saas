import type { Connector } from "./types";

const connectors = new Map<string, Connector<never>>();

/** Registers a connector under its provider name. Registering twice replaces the earlier one. */
export function registerConnector<TCredentials>(connector: Connector<TCredentials>): void {
  connectors.set(connector.provider, connector as unknown as Connector<never>);
}

export function getConnector<TCredentials = unknown>(
  provider: string,
): Connector<TCredentials> | undefined {
  return connectors.get(provider) as unknown as Connector<TCredentials> | undefined;
}

export function listConnectors(): string[] {
  return [...connectors.keys()];
}
