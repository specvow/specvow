export type SpecLocation = "path" | "query" | "header" | "cookie" | "body" | "field";

export type SpecParam = {
  name: string;
  location: SpecLocation;
};

export type SpecOperation = {
  operationId: string;
  method: string;
  path: string;
  params: SpecParam[];
};

export type SdkField = {
  name: string;
  optional: boolean;
};

export type SdkParam = {
  name: string;
  optional: boolean;
  fields: SdkField[];
};

export type SdkMethod = {
  name: string;
  params: SdkParam[];
  /** Set when the method is tagged with `@operation operationId`. */
  operationId?: string;
};

export type Match = {
  method: string;
  operationId: string;
  via: "map" | "tag" | "auto";
};

export type FindingLevel = "breaking" | "gap" | "note";

export type FindingCode =
  | "missing-method"
  | "orphan-method"
  | "new-required-param"
  | "removed-method"
  | "removed-operation";

export type Finding = {
  level: FindingLevel;
  code: FindingCode;
  method?: string;
  operationId?: string;
  detail: string;
};

export type LockMethod = {
  name: string;
  operationId: string;
  http: string;
  params: Array<{ name: string; optional: boolean }>;
};

export type LockFile = {
  specvow: 1;
  client: string;
  methods: LockMethod[];
};
