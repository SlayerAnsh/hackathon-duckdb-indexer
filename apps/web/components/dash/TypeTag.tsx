export function TypeTag({value,index=0}:{value:string;index?:number}) { return <span className="tt"><i style={{background:`var(--c${index%8+1})`}}/>{value}</span> }
