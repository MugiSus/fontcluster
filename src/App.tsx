function App() {
  return (
    <main class='grid flex-1 grid-cols-12 items-stretch justify-stretch gap-4 p-4 pt-1'>
      <div class='col-span-3 flex flex-col items-start rounded-md border bg-muted/10 px-6 py-4'>
        <h2 class='text-3xl font-light'>Circular</h2>
      </div>
      <div class='col-span-9 rounded-md border bg-muted/10' />
    </main>
  );
}

export default App;
