<!-- web/src/lib/components/ui/Input.svelte -->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props {
    value?: string;
    type?: 'text' | 'password' | 'email' | 'search' | 'url';
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    helpText?: string;
    errorText?: string;
    label?: string;
    id?: string;
    name?: string;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    fullWidth?: boolean;
    leadingIcon?: import('svelte').Snippet;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
  }

  let {
    value = $bindable(''),
    type = 'text',
    placeholder,
    disabled = false,
    invalid = false,
    helpText,
    errorText,
    label,
    id,
    name,
    autocomplete,
    fullWidth = true,
    leadingIcon,
    oninput,
    onchange
  }: Props = $props();

  const inputId = $derived(id ?? `inp-${Math.random().toString(36).slice(2, 9)}`);
  const showError = $derived(invalid && !!errorText);
</script>

<div class="field" class:full-width={fullWidth}>
  {#if label}<label class="label" for={inputId}>{label}</label>{/if}
  <div class="control" class:invalid>
    {#if leadingIcon}
      <span class="leading">{@render leadingIcon()}</span>
    {/if}
    <input
      id={inputId}
      {type}
      {placeholder}
      {disabled}
      {name}
      {autocomplete}
      bind:value
      {oninput}
      {onchange}
      aria-invalid={invalid}
      aria-describedby={showError ? `${inputId}-err` : helpText ? `${inputId}-help` : undefined}
    />
  </div>
  {#if showError}
    <p id="{inputId}-err" class="error">{errorText}</p>
  {:else if helpText}
    <p id="{inputId}-help" class="help">{helpText}</p>
  {/if}
</div>

<style lang="scss">
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);

    &.full-width {
      width: 100%;
    }
  }

  .label {
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    color: var(--c-text-2);
  }

  .control {
    display: flex;
    align-items: center;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    transition:
      border-color var(--tr-fast),
      box-shadow var(--tr-fast);

    &:focus-within {
      border-color: var(--c-accent);
      box-shadow: 0 0 0 3px var(--c-accent-bg);
    }

    &.invalid {
      border-color: var(--c-danger);

      &:focus-within {
        box-shadow: 0 0 0 3px var(--c-danger-bg);
      }
    }
  }

  .leading {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    color: var(--c-text-3);
  }

  input {
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--c-text);
    padding: 0 var(--sp-3);
    height: 36px;
    font-size: var(--fs-md);
    font-family: inherit;

    &::placeholder {
      color: var(--c-text-3);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .help {
    font-size: var(--fs-xs);
    color: var(--c-text-3);
    margin: 0;
  }

  .error {
    font-size: var(--fs-xs);
    color: var(--c-danger);
    margin: 0;
  }
</style>
