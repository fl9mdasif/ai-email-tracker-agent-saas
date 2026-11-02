export type AccountField = "preset" | "email" | "password" | "label";

/** What the add-account form shows after each submit. Never contains a secret. */
export type AccountFormState = {
  status: "idle" | "success" | "error";
  message: string;
  /** True only after the account was actually saved (not after a plain connection test). */
  saved?: boolean;
  fieldErrors: Partial<Record<AccountField, string>>;
};

export const initialAccountFormState: AccountFormState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};
