/** 温暖玻璃感三点布光 */
export function WarmGlassLights() {
  return (
    <>
      <ambientLight intensity={0.55} color="#fff8f0" />
      <directionalLight position={[4, 6, 5]} intensity={1.1} color="#ffe8c8" />
      <directionalLight position={[-5, 2, -3]} intensity={0.45} color="#c8e8d0" />
      <pointLight position={[0, -2, 3]} intensity={0.35} color="#f5c896" />
    </>
  )
}
