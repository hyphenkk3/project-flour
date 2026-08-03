type PageHeaderProps = {
  title: string;
  description?: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <h2 className="font-display text-ink text-3xl tracking-tight md:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="text-skyline mt-2 max-w-2xl text-base">{description}</p>
      ) : null}
    </div>
  );
}
