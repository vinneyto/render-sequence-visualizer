document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("input");
  const paper = document.getElementById("paper");

  input.addEventListener("input", () => {
    paper.innerHTML = "";

    if (input.value) {
      try {
        const sequence = JSON.parse(input.value);
        paper.innerHTML = renderSequence(sequence);
      } catch (e) {
        paper.innerHTML = e.toString();
      }
    }
  });
});

const ITEM_WIDTH = 8 * 14;
const ITEM_HEIGHT = 8 * 6;
const GAP_VERT = 16;
const GAP_HOR = 32;

function renderSequence(sequence) {
  const scene = buildScene(sequence);

  console.log(scene);

  return `
    <svg width="${scene.width}" height="${scene.height}">
      <g transform="translate(0, ${ITEM_HEIGHT})">
      ${scene.passes
        .map((pass) => {
          const header = `<text
                            x="${pass.subpasses[0].x + 8}"
                            y="${pass.subpasses[0].y - 8}"
                            fill="black">${pass.name}</text>`;
          const body = pass.subpasses
            .map((subpass) => {
              const label = `
              <g transform="translate(${subpass.x}, ${subpass.y})">
                <rect
                  width="${ITEM_WIDTH}"
                  height="${ITEM_HEIGHT}"
                  rx="8" ry="8"
                  style="fill:rgb(0,0,255);"></rect>
                <text x="8" y="30" fill="white">${subpass.name}</text>
              </g>
            `;
              const input = subpass.input
                .map((input) => {
                  return `<circle
                  cx="${input.x}"
                  cy="${input.y}"
                  r="4"
                  stroke="black"
                  stroke-width="2"
                  fill="white" />`;
                })
                .join("\n");
              const output = subpass.output
                .map((output) => {
                  return `<circle
                  cx="${output.x}"
                  cy="${output.y}"
                  r="4"
                  stroke="black"
                  stroke-width="2"
                  fill="white" />
                  <text
                    x="${output.x + 4}"
                    y="${output.y - 4}"
                    style="fill:gray;font-size:11px;">${output.name}</text>`;
                })
                .join("\n");
              return `${label}${input}${output}`;
            })
            .join("\n");
          const joins = scene.joins
            .map((j) => {
              return `<path
                      d="M${j.from.x} ${j.from.y} C ${j.c1.x} ${j.c1.y}, ${j.c2.x} ${j.c2.y}, ${j.to.x} ${j.to.y}"
                      stroke="${j.color}"
                      stroke-width="3"
                      stroke-linecap="round"
                      fill=" none"
                      />`;
            })
            .join("\n");
          return `${header}${body}${joins}`;
        })
        .join("\n")}
      </g>
    </svg>
  `;
}

function calcVertOffset(passes, i) {
  return (
    (ITEM_HEIGHT + GAP_VERT) * i +
    (i > 0
      ? (passes[i - 1].subpasses.length - 1) * (ITEM_HEIGHT + GAP_VERT)
      : 0)
  );
}

function buildScene(sequence) {
  let maxX = 0;
  let maxY = 0;

  const passes = sequence.passes.map((pass, i) => {
    const vertOffset = calcVertOffset(sequence.passes, i);

    const subpasses = pass.subpasses.map((subpass, j) => {
      const x = (ITEM_WIDTH + GAP_HOR) * i;
      const y = vertOffset + (ITEM_HEIGHT + GAP_VERT) * j;

      const inputGap = ITEM_HEIGHT / (subpass.input.length + 1);
      const input = subpass.input.map((obj, inputIdx) => {
        return {
          x,
          y: y + (inputIdx + 1) * inputGap,
          name: obj.name,
          id: getAttachmentId(pass, subpass, obj),
        };
      });

      const outputGap = ITEM_HEIGHT / (subpass.output.length + 1);
      const output = subpass.output.map((obj, outputIdx) => {
        return {
          x: x + ITEM_WIDTH,
          y: y + (outputIdx + 1) * outputGap,
          name: obj.name,
          id: getAttachmentId(pass, subpass, obj),
        };
      });

      maxX = x;
      maxY = y;

      return {
        x,
        y,
        name: subpass.name,
        input,
        output,
      };
    });

    return { name: pass.name, subpasses };
  });

  const flatInputs = new Map();
  const flatOutputs = new Map();

  for (const pass of passes) {
    for (const subpass of pass.subpasses) {
      for (const input of subpass.input) {
        flatInputs.set(input.id, input);
      }
      for (const output of subpass.output) {
        flatOutputs.set(output.id, output);
      }
    }
  }

  const joins = [];

  for (const pass of sequence.passes) {
    for (const subpass of pass.subpasses) {
      for (const input of subpass.input) {
        const inputId = getAttachmentId(pass, subpass, input);
        const outputId = getSubPassInputTextureId(
          sequence,
          pass,
          subpass,
          input.name
        );

        const sceneInput = flatInputs.get(inputId);
        const sceneOutput = flatOutputs.get(outputId);

        if (sceneInput === undefined || sceneOutput === undefined) {
          throw new Error(`unable to match ${inputId} and ${outputId}`);
        }

        const from = { x: sceneOutput.x, y: sceneOutput.y };
        const to = { x: sceneInput.x, y: sceneInput.y };
        const c1 =
          from.x < to.x
            ? { x: from.x + 32, y: from.y }
            : { x: from.x, y: from.y + 32 };
        const c2 =
          from.x < to.x ? { x: to.x - 32, y: to.y } : { x: to.x, y: to.y - 32 };

        joins.push({
          from,
          to,
          c1,
          c2,
          color: stringToColour(inputId),
        });
      }
    }
  }

  return {
    passes,
    joins,
    width: maxX + ITEM_WIDTH * 2,
    height: maxY + ITEM_HEIGHT * 2,
  };
}

function stringToColour(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let colour = "#";
  for (let i = 0; i < 3; i++) {
    let value = (hash >> (i * 8)) & 0xff;
    colour += ("00" + value.toString(16)).substr(-2);
  }
  return colour;
}

function getSubPassInputTextureId(sequence, pass, subpass, name) {
  const input = subpass.input.find((a) => a.name === name);

  if (input === undefined) {
    return undefined;
  }

  if (input.passInput !== undefined) {
    const passInput = pass.input.find((a) => a.name === input.passInput);

    const otherPass = sequence.passes.find(
      (p) => p.name === passInput.pass.name
    );
    const otherPassOutput = otherPass.output.find(
      (a) => a.name === passInput.pass.output
    );
    const otherPassSubpass = otherPass.subpasses.find(
      (sp) => sp.name === otherPassOutput.subpass.name
    );
    const att = otherPassSubpass.output.find(
      (a) => a.name === otherPassOutput.subpass.output
    );

    return getAttachmentId(otherPass, otherPassSubpass, att);
  }

  const otherSubpass = pass.subpasses.find(
    (p) => p.name === input.subpass.name
  );
  const otherSubpassOutput = otherSubpass.input.find(
    (a) => a.name === input.subpass.output
  );

  return getAttachmentId(pass, otherSubpass, otherSubpassOutput);
}

function getAttachmentId(pass, subpass, att) {
  return `${pass.name}:${subpass.name}:${att.name}`;
}

/*
{
    "passes": [
        {
            "input": [],
            "output": [
                {
                    "subpass": {
                        "name": "main",
                        "output": "color"
                    },
                    "name": "color"
                },
                {
                    "subpass": {
                        "name": "main",
                        "output": "depth"
                    },
                    "name": "depth"
                }
            ],
            "subpasses": [
                {
                    "name": "main",
                    "input": [],
                    "output": [
                        {
                            "name": "color"
                        },
                        {
                            "name": "depth"
                        }
                    ],
                    "background": {
                        "alpha": 0
                    },
                    "clear": [
                        "color",
                        "depth"
                    ]
                }
            ],
            "name": "main"
        },
        {
            "input": [
                {
                    "pass": {
                        "name": "main",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "output": [
                {
                    "subpass": {
                        "name": "composition",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "subpasses": [
                {
                    "name": "composition",
                    "input": [
                        {
                            "passInput": "color",
                            "name": "colorMap"
                        }
                    ],
                    "output": [
                        {
                            "name": "color"
                        }
                    ],
                    "uniforms": [
                        {
                            "name": "resolution",
                            "value": "uniform_resolution"
                        }
                    ],
                    "shader": {
                        "type": "shader_screen",
                        "transparent": true
                    },
                    "clear": [
                        "color"
                    ]
                }
            ],
            "name": "composition"
        },
        {
            "input": [
                {
                    "pass": {
                        "name": "composition",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "output": [
                {
                    "subpass": {
                        "name": "fxaa",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "subpasses": [
                {
                    "name": "fxaa",
                    "input": [
                        {
                            "passInput": "color",
                            "name": "colorMap"
                        }
                    ],
                    "output": [
                        {
                            "target": "target_frame",
                            "name": "color"
                        }
                    ],
                    "uniforms": [
                        {
                            "name": "resolution",
                            "value": "uniform_resolution"
                        }
                    ],
                    "shader": {
                        "type": "shader_fxaa"
                    },
                    "clear": [
                        "color"
                    ]
                }
            ],
            "name": "fxaa"
        },
        {
            "input": [
                {
                    "pass": {
                        "name": "fxaa",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "output": [
                {
                    "subpass": {
                        "name": "grid",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "subpasses": [
                {
                    "name": "intervals",
                    "input": [
                        {
                            "passInput": "color",
                            "name": "color"
                        }
                    ],
                    "output": [
                        {
                            "target": "target_frame",
                            "name": "color"
                        }
                    ],
                    "clear": [
                        "depth"
                    ]
                },
                {
                    "name": "grid",
                    "input": [
                        {
                            "subpass": {
                                "name": "intervals",
                                "output": "color"
                            },
                            "name": "color"
                        }
                    ],
                    "output": [
                        {
                            "target": "target_frame",
                            "name": "color"
                        }
                    ],
                    "clear": [
                        "depth"
                    ]
                }
            ],
            "name": "overlay"
        },
        {
            "input": [
                {
                    "pass": {
                        "name": "overlay",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "output": [
                {
                    "subpass": {
                        "name": "screen",
                        "output": "color"
                    },
                    "name": "color"
                }
            ],
            "subpasses": [
                {
                    "name": "screen",
                    "input": [
                        {
                            "passInput": "color",
                            "name": "colorMap"
                        }
                    ],
                    "output": [
                        {
                            "target": "screen",
                            "name": "color"
                        }
                    ],
                    "uniforms": [
                        {
                            "name": "resolution",
                            "value": "uniform_resolution"
                        }
                    ],
                    "shader": {
                        "type": "shader_screen"
                    },
                    "clear": [
                        "color"
                    ]
                }
            ],
            "name": "screen"
        }
    ]
}
*/
