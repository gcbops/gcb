const fs = require("fs");
const path = require("path");

const source = "build/scripts.bundle.js";
const output = "backend/js/scripts.html";

const js = fs.readFileSync(
  path.resolve(source),
  "utf8"
);

const html =
`<script>

${js}

</script>
`;

fs.writeFileSync(
  path.resolve(output),
  html,
  "utf8"
);

console.log(`✓ Generated ${output}`);