## Variant: Master / Detail

### Design stance
Turn plugin management into a selection workflow: concise inventory on the left, focused details and actions on the right.

### Key choices
- Layout: 42/58 split pane
- Interaction: selecting a plugin updates the detail pane
- Change cost: medium-low; needs selected-row state

### Trade-offs
- Strong at: balanced composition, focused destructive actions, stable viewport
- Weak at: less useful for comparing several plugins simultaneously

### Best for
Careful inspection and configuration-oriented workflows.
