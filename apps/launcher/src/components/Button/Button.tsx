import './Button.css';

export function Button({
  label,
  focused,
}: {
  label: string;
  focused: boolean;
}) {
  return <span class={focused ? 'button focused' : 'button'}>{label}</span>;
}
