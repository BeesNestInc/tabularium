<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';

  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { json } from '@codemirror/lang-json';
  import { yaml } from '@codemirror/lang-yaml';

  export let value = '';
  export let language = 'text';
  export let readonly = false;
  export let disabled = false;
  export let placeholder = '';

  const dispatch = createEventDispatcher();

  let container;
  let view;

  const languageCompartment = new Compartment();
  const editableCompartment = new Compartment();

  const getLanguageExtension = (language) => {
    switch (language) {
      case 'markdown':
        return markdown();
      case 'json':
        return json();
      case 'yaml':
        return yaml();
      case 'text':
      default:
        return [];
    }
  };

  const createState = () => {
    return EditorState.create({
      doc: value ?? '',
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),

        languageCompartment.of(getLanguageExtension(language)),
        editableCompartment.of(
          EditorView.editable.of(!(readonly || disabled))
        ),

        EditorView.lineWrapping,

        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const nextValue = update.state.doc.toString();
            dispatch('change', { value: nextValue });
          }
        }),
      ],
    });
  };

  const syncValue = (nextValue) => {
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === nextValue) return;

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: nextValue ?? '',
      },
    });
  };

  const syncLanguage = () => {
    if (!view) return;

    view.dispatch({
      effects: languageCompartment.reconfigure(
        getLanguageExtension(language)
      ),
    });
  };

  const syncEditable = () => {
    if (!view) return;

    view.dispatch({
      effects: editableCompartment.reconfigure(
        EditorView.editable.of(!(readonly || disabled))
      ),
    });
  };

  onMount(() => {
    view = new EditorView({
      state: createState(),
      parent: container,
    });
  });

  onDestroy(() => {
    if (view) {
      view.destroy();
      view = null;
    }
  });

  $: if (view) {
    syncLanguage();
  }

  $: if (view) {
    syncEditable();
  }

  $: if (view) {
    syncValue(value ?? '');
  }
</script>

<div class="editor-root">
  <div class="editor-container" bind:this={container}></div>
</div>