import { cssVariables } from '@mukhtalif/design-tokens';

/** Inject once at app startup: `:root` custom properties for every token. */
export const tokenCss = `:root {\n${cssVariables()}\n}`;
