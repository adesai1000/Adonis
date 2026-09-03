import { format } from "date-fns"
import { useNav } from "@/store/nav"
import { SECTION_TITLES } from "./header"

/** Stickshift `.page-head`: a microlabel over a big display headline. */
export function PageHead() {
  const { section } = useNav()
  return (
    <div className="flex items-end justify-between gap-4 px-1 pt-4 pb-4 md:pt-7 md:pb-7">
      <div>
        <span className="microlabel mb-2 block md:mb-3">
          {format(new Date(), "EEEE, MMM d")}
        </span>
        <h1 className="font-display text-[30px] leading-none font-medium tracking-[-0.025em] md:text-[clamp(38px,4.2vw,56px)]">
          {SECTION_TITLES[section]}
        </h1>
      </div>
    </div>
  )
}
