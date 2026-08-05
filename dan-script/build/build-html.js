const fs = require("fs");
const path = require("path");

const files = [
  {
    source: "src/scripts.js",
    output: "backend/js/scripts.html"
  }
];

files.forEach(file => {

  const js = fs.readFileSync(
    path.resolve(file.source),
    "utf8"
  );

  const html =
`<script>

${js}

</script>
`;

  fs.writeFileSync(
    path.resolve(file.output),
    html,
    "utf8"
  );

  console.log(`✓ Generated ${file.output}`);

});