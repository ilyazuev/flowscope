import { useMemo, useState, type JSX, type MouseEvent } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import Form from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import type {
  ArrayFieldTemplateProps,
  ArrayFieldItemTemplateProps,
  RegistryWidgetsType,
  RJSFSchema,
  UiSchema,
  WidgetProps,
} from '@rjsf/utils';
import type { ColumnInfoSchema } from '@pondpilot/flowscope-core';

interface ParsedColumnInfoSchemas {
  schema: RJSFSchema;
  uiSchema: UiSchema;
}

interface ColumnInfoFormProps {
  info?: string | null;
  columnInfoSchemas?: ColumnInfoSchema | null;
}

function parseJsonOrNull<T>(value: unknown): T | null {
  if (value == null) return null;

  if (typeof value !== 'string') {
    return value as T;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  try {
    return JSON.parse(trimmedValue) as T;
  } catch {
    return null;
  }
}

function normalizeColumnInfoFormData(info: unknown): unknown[] {
  const parsed = parseJsonOrNull<unknown>(info);

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];

  return [];
}

function parseColumnInfoSchemas(
  columnInfoSchemas?: ColumnInfoSchema | null
): ParsedColumnInfoSchemas | null {
  if (!columnInfoSchemas) return null;

  const schema = parseJsonOrNull<RJSFSchema>(columnInfoSchemas.jsonSchema);
  const uiSchema = parseJsonOrNull<UiSchema>(columnInfoSchemas.uiSchema);

  if (!schema || !uiSchema) return null;

  return { schema, uiSchema };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function UrlLinkWidget(props: WidgetProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const value = typeof props.value === 'string' ? props.value.trim() : '';

  if (!value) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (!isHttpUrl(value)) {
    return (
      <span className="block break-all rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {value}
      </span>
    );
  }

  async function handleCopy(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex max-w-full items-center gap-1">
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border px-3 py-2 text-sm text-primary hover:bg-muted"
        title={value}
      >
        <span className="truncate max-w-[40vh]">{value}</span>
        <ExternalLink className="size-3.5 shrink-0" />
      </a>

      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
        title={copied ? 'Copied' : 'Copy URL'}
        aria-label={copied ? 'Copied' : 'Copy URL'}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}

const columnInfoWidgets: RegistryWidgetsType = {
  UrlLinkWidget,
};

function ColumnInfoArrayFieldTemplate(props: ArrayFieldTemplateProps): JSX.Element {
  return <div className="flex gap-4 pb-3">{props.items}</div>; // overflow-x-auto
}

function HiddenButtonTemplate(): null {
  return null;
}

function ColumnInfoArrayFieldItemTemplate(props: ArrayFieldItemTemplateProps): JSX.Element {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between border-b pb-2">
        <div className="text-sm font-semibold text-foreground">Record {props.index + 1}</div>
        <div className="text-xs text-muted-foreground">
          {props.index + 1} / {props.totalItems}
        </div>
      </div>

      {props.children}
    </div>
  );
}

function RawColumnInfoFallback({ title, info }: { title: string; info?: string | null }): JSX.Element {
  return (
    <div className="space-y-2 p-4">
      <div className="text-sm font-medium text-destructive">{title}</div>
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs text-muted-foreground">
        {info?.trim() || 'No information'}
      </pre>
    </div>
  );
}

export function ColumnInfoForm({ info, columnInfoSchemas }: ColumnInfoFormProps): JSX.Element {
  const parsedSchemas = useMemo(
    () => parseColumnInfoSchemas(columnInfoSchemas),
    [columnInfoSchemas]
  );

  const formData = useMemo(() => normalizeColumnInfoFormData(info), [info]);

  if (!info?.trim()) {
    return <div className="p-4 text-sm text-muted-foreground">No information</div>;
  }

  if (!parsedSchemas) {
    return (
      <RawColumnInfoFallback
        title="Column info schema is missing or invalid."
        info={info}
      />
    );
  }

  if (formData.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">{info}</div>; // return <RawColumnInfoFallback title="Column info is not a valid JSON array/object." info={info} />;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <Form
        className={"min-w-[85vh]"}
        schema={parsedSchemas.schema}
        uiSchema={parsedSchemas.uiSchema}
        formData={formData}
        validator={validator}
        widgets={columnInfoWidgets}
        templates={{
          ArrayFieldTemplate: ColumnInfoArrayFieldTemplate,
          ArrayFieldItemTemplate: ColumnInfoArrayFieldItemTemplate,
          ButtonTemplates: {
            AddButton: HiddenButtonTemplate,
            RemoveButton: HiddenButtonTemplate,
            MoveUpButton: HiddenButtonTemplate,
            MoveDownButton: HiddenButtonTemplate,
            SubmitButton: HiddenButtonTemplate,
          },
        }}
        readonly
        noValidate
        liveValidate={false}
        showErrorList={false}
        omitExtraData={false}
      />
    </div>
  );
}

export default ColumnInfoForm;
