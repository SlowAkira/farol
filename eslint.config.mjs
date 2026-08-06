import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// SDKs de plataforma de anuncios. Adicionar aqui ao instalar um novo: a regra so
// pega o que estiver listado.
const ADS_SDKS = [
  "facebook-nodejs-business-sdk",
  "google-ads-api",
  "google-ads-nodejs-client",
  "@google-ads/googleads",
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/generated/**",
    ],
  },
  // Torna verificavel a fronteira do CLAUDE.md: toda leitura de dado externo passa
  // por AdsProvider. Sem isto a regra dependia so de boa vontade em revisao.
  // Coberta por src/lib/providers/boundary.test.ts.
  {
    name: "farol/fronteira-de-providers",
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/lib/providers/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ADS_SDKS.map((name) => ({
            name,
            message:
              "SDK de plataforma de anuncios so pode ser importado dentro de src/lib/providers. Use getProvider() de @/lib/providers.",
          })),
          patterns: [
            {
              // Os dois ultimos cobrem a forma relativa ("../providers/mock"), que
              // nao casa com os padroes que exigem "lib/" no caminho escrito.
              group: [
                "@/lib/providers/*",
                "**/lib/providers/*",
                "**/providers/mock",
                "**/providers/meta",
              ],
              message:
                "Importe de @/lib/providers. O barrel reexporta a interface publica (AdsProvider, tipos e erros); os arquivos internos da camada, mock.ts e meta.ts entre eles, nao sao alcancaveis de fora.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
