# C4 Architecture Diagrams

This directory contains [C4 model](https://c4model.com/) architecture diagrams using PlantUML with the [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) library.

## Diagrams

| Level | Diagram                                        | Description                                        |
| ----- | ---------------------------------------------- | -------------------------------------------------- |
| 1     | [c4-context.puml](c4-context.puml)             | System context showing external actors and systems |
| 2     | [c4-container.puml](c4-container.puml)         | Container view showing module boundaries           |
| 3     | [c4-component-mpc.puml](c4-component-mpc.puml) | MPC module internals                               |
| 3     | [c4-component-hsm.puml](c4-component-hsm.puml) | HSM module internals                               |

## Rendering

### VS Code

Install the [PlantUML extension](https://marketplace.visualstudio.com/items?itemName=jebbs.plantuml) and use `Alt+D` to preview.

### Command Line

```bash
# Install PlantUML
brew install plantuml

# Render to PNG
plantuml -tpng docs/architecture/c4/*.puml

# Render to SVG
plantuml -tsvg docs/architecture/c4/*.puml
```

### Online

Paste the `.puml` content into [PlantUML Web Server](http://www.plantuml.com/plantuml/uml/).

## C4 Model Levels

1. **Context** - System scope and external dependencies
2. **Container** - High-level technical building blocks
3. **Component** - Internal structure of a container
4. **Code** - Class/function level (not included here)

## References

- [C4 Model](https://c4model.com/)
- [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML)
- [PlantUML](https://plantuml.com/)
