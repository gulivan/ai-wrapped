declare module "electrobun/bun" {
  type AnyRequests = Record<string, { params: unknown; response: unknown }>;
  type AnyMessages = Record<string, unknown>;

  export type RPCSchema<T extends { requests?: unknown; messages?: unknown }> = {
    requests: T extends { requests: infer R } ? R : AnyRequests;
    messages: T extends { messages: infer M } ? M : AnyMessages;
  };

  export interface ElectrobunRPCSchema {
    bun: { requests: AnyRequests; messages: AnyMessages };
    webview: { requests: AnyRequests; messages: AnyMessages };
  }

  type Side = "bun" | "webview";
  type OtherSide<S extends Side> = S extends "bun" ? "webview" : "bun";

  type RequestHandlers<Requests extends AnyRequests> = {
    [K in keyof Requests]?: (
      params: Requests[K]["params"],
    ) => Requests[K]["response"] | Promise<Requests[K]["response"]>;
  };

  type MessageHandlers<Messages extends AnyMessages> = {
    [K in keyof Messages]?: (payload: Messages[K]) => void;
  } & {
    "*"?:
      | ((messageName: keyof Messages, payload: Messages[keyof Messages]) => void)
      | undefined;
  };

  type RPCInstance<Schema extends ElectrobunRPCSchema, S extends Side> = {
    request: {
      [K in keyof Schema[OtherSide<S>]["requests"]]: (
        params: Schema[OtherSide<S>]["requests"][K]["params"],
      ) => Promise<Schema[OtherSide<S>]["requests"][K]["response"]>;
    };
    send: {
      [K in keyof Schema[OtherSide<S>]["messages"]]: (
        payload: Schema[OtherSide<S>]["messages"][K],
      ) => void;
    };
    addMessageListener: (
      message: keyof Schema[S]["messages"] | "*",
      listener: (...args: unknown[]) => void,
    ) => void;
    removeMessageListener: (
      message: keyof Schema[S]["messages"] | "*",
      listener: (...args: unknown[]) => void,
    ) => void;
  };

  export type MenuItemConfig = {
    type?: string;
    label?: string;
    tooltip?: string;
    action?: string;
    role?: string;
    data?: unknown;
    submenu?: Array<MenuItemConfig>;
    enabled?: boolean;
    checked?: boolean;
    hidden?: boolean;
    accelerator?: string;
  };

  export type ApplicationMenuItemConfig = MenuItemConfig;

  export class BrowserView {
    static defineRPC<Schema extends ElectrobunRPCSchema>(config: {
      handlers: {
        requests?: RequestHandlers<Schema["bun"]["requests"]>;
        messages?: MessageHandlers<Schema["bun"]["messages"]>;
      };
      maxRequestTime?: number;
    }): RPCInstance<Schema, "bun">;
  }

  export class BrowserWindow<T = unknown> {
    constructor(options?: Record<string, unknown>);
    readonly webview: { rpc?: T };
    show(): void;
    focus(): void;
    minimize(): void;
    unminimize(): void;
    isMinimized(): boolean;
    on(name: string, handler: (event: unknown) => void): void;
  }

  export class Tray {
    constructor(options?: {
      title?: string;
      image?: string;
      template?: boolean;
      width?: number;
      height?: number;
    });
    setTitle(title: string): void;
    setImage(path: string): void;
    setMenu(menu: Array<MenuItemConfig>): void;
    on(name: "tray-clicked", handler: (event: unknown) => void): void;
    remove(): void;
  }

  export const ApplicationMenu: {
    setApplicationMenu: (menu: Array<ApplicationMenuItemConfig>) => void;
    on: (name: "application-menu-clicked", handler: (event: unknown) => void) => void;
  };

  export const Utils: {
    quit: () => void;
  };

  export const PATHS: {
    VIEWS_FOLDER: string;
  };

  const Electrobun: {
    events: {
      on: (name: string, handler: (event: unknown) => void) => void;
    };
  };

  export default Electrobun;
}
