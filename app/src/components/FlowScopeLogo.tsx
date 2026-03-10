// interface FlowScopeLogoProps {
//   className?: string;
// }

/**
 * FlowScope duck logo with theme-aware shadow coloring.
 * The shadow paths use currentColor which inherits from the parent's text color.
 */
export function FlowScopeLogo() { // { className }: FlowScopeLogoProps
  return (
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAATCAMAAAC9bj0JAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAEyUExURfVnAPRyAPeXUPaHMvZeAPNfAPZ9Ifm8kfefXfNiAPJiAPZuAPaMOPRyC/ZrAPd4AvV1EfzbwvrGof3m1/+iav9xAP1zAPRuAP9gAPFaAPRiAPWiaPaHKfV6KPNmAPNZAPV/KfV6GvitZvm2gvJZAPeiZPaQRPm4jP+NM/92GPZwAPNjAPeTSfJhAPJ0D/lpB/VlAPJgAPNnAPWse/V6DvaQQfFfAPddAPFaAPV2CvJgAPhVAPJ6CfebVvitcveEH/WELfNcAPvUtf3u5fmDKfRkAPR+FfZyAPR/G+9oAPNmAPRmAPrPk/nEkfduAPSHNfBfAPJUAPSFMvNhAPN8KvJkAPV/K/iyfPWQM/VfAPV/I/NcAPJ6DvNQAPJiAPWBIPWMQ/JHAPima/zbxv/590dwTO3s0sAAAABmdFJOU/////7//v7//4+u/v/+//7////+AhkouBa4irj//vb+/v7//6/+/v4LBnprubc7HDWfYrj/+PBxzp2iMoL+////xf//Wl7S++5RmJH//0PV8zyo15s9uP/Uubh98/7snc/+/v7+AHnkJeEAAAEoSURBVBjThdHVckJBDAbg3T1uHCtO4eAMTnEtUuruLrR5/1coS0tvarnLfJM/kwmCXwr9Bd2nUWLU832H55hoiLHTRb/iznxBd2jZE1u4P6H9zvbmxhJ6eGy9WSbboGGZrLI1/YS2IrymzTRii4ssj2dX+oAEH7dnNtF0abl4L7eAio6EiYiNWgugeB2gU3KJQkB3jBRisOJqJR4H+t1cck0KayENKQ6z6mDXOkqScAmgXKHgCzMqdoZMhGNE1E/iJoBHplCu8xqvcVGOI0nEE7YDcFGgcB4nHBdxBBVFjReScskAnQCg9lGdMJH+TE0Pog84JfLrEkyP3YD2DwSFVU3rKhRia+Y4zqLGWfhwfkfe6y3489Vg0Ov3X1aDtzeylC39948f6x03YHM0swGnlAAAAABJRU5ErkJggg=="/>
  );  
  // return (
  //   <svg
  //     width="51"
  //     height="42"
  //     viewBox="0 0 51 42"
  //     fill="none"
  //     xmlns="http://www.w3.org/2000/svg"
  //     className={className}
  //     role="img"
  //     aria-label="FlowScope logo"
  //   >
  //     {/* Shadow - uses currentColor for theme awareness */}
  //     <path
  //       d="M13.5 42C6.04416 42 3.25905e-07 35.9558 0 28.5C-3.25905e-07 21.0442 6.04415 15 13.5 15H25.5C32.9558 15 39 21.0442 39 28.5C39 35.9558 32.9558 42 25.5 42H13.5Z"
  //       fill="currentColor"
  //       fillOpacity="0.3"
  //     />
  //     {/* Head - green */}
  //     <path
  //       d="M31.5 27C24.0442 27 18 20.9558 18 13.5C18 6.04416 24.0442 3.25905e-07 31.5 0C38.9558 -3.25905e-07 45 6.04416 45 13.5C45 20.9558 38.9558 27 31.5 27Z"
  //       fill="#4CAE4F"
  //     />
  //     {/* Eyes - dark blue */}
  //     <path
  //       d="M43.5 15C44.3284 15 45 14.3284 45 13.5C45 12.6716 44.3284 12 43.5 12C42.6716 12 42 12.6716 42 13.5C42 14.3284 42.6716 15 43.5 15Z"
  //       fill="#1B255A"
  //     />
  //     <path
  //       d="M31.5 15C32.3284 15 33 14.3284 33 13.5C33 12.6716 32.3284 12 31.5 12C30.6716 12 30 12.6716 30 13.5C30 14.3284 30.6716 15 31.5 15Z"
  //       fill="#1B255A"
  //     />
  //     {/* Beak - orange */}
  //     <path
  //       d="M37.5 24C35.0147 24 33 21.9853 33 19.5C33 17.0147 35.0147 15 37.5 15L46.5 15C48.9853 15 51 17.0147 51 19.5C51 21.9853 48.9853 24 46.5 24H37.5Z"
  //       fill="#F4A462"
  //     />
  //     {/* Tail shadow - uses currentColor for theme awareness */}
  //     <path
  //       d="M30.8908 28.971C30.7628 30.9568 29.94 32.9063 28.4223 34.424C25.1074 37.7388 19.733 37.7388 16.4181 34.424L10.418 28.4238L16.4179 22.4239C19.7327 19.1091 25.1072 19.1091 28.422 22.4239C30.2181 24.22 31.0411 26.6208 30.8908 28.971Z"
  //       fill="currentColor"
  //       fillOpacity="0.3"
  //     />
  //   </svg>
  // );
}
