export function StatusView(props: { status: string }) {
  if (props.status === "empty") return <p>没有草稿</p>;
  return <p>{props.status}</p>;
}
