import { Button } from './ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from './ui/text-field';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-solid';

interface FontProcessingFormProps {
  sampleText: string;
  isGenerating: boolean;
  isVectorizing: boolean;
  isCompressing: boolean;
  isClustering: boolean;
  onSampleTextChange: (text: string) => void;
  onSubmit: (text: string) => void;
}

export function FontProcessingForm(props: FontProcessingFormProps) {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const text = formData.get('preview-text') as string;
    props.onSubmit(text || 'A quick brown fox jumps over the lazy dog');
  };

  const isProcessing = () =>
    props.isGenerating ||
    props.isVectorizing ||
    props.isCompressing ||
    props.isClustering;

  return (
    <form
      onSubmit={handleSubmit}
      class='flex w-full flex-col items-stretch gap-3'
    >
      <TextField class='grid w-full items-center gap-2 pt-1'>
        <TextFieldLabel for='preview-text'>Preview Text</TextFieldLabel>
        <TextFieldInput
          type='text'
          name='preview-text'
          id='preview-text'
          value={props.sampleText}
          onInput={(e) => props.onSampleTextChange(e.currentTarget.value)}
          placeholder='A quick brown fox jumps over the lazy dog'
        />
      </TextField>
      <Button
        type='submit'
        disabled={isProcessing()}
        variant='outline'
        class='flex items-center gap-2'
      >
        {props.isGenerating ? (
          <>
            Generating Images... (1/4)
            <LoaderCircleIcon class='animate-spin' />
          </>
        ) : props.isVectorizing ? (
          <>
            Vectorizing Images... (2/4)
            <LoaderCircleIcon class='animate-spin' />
          </>
        ) : props.isCompressing ? (
          <>
            Compressing Vectors... (3/4)
            <LoaderCircleIcon class='animate-spin' />
          </>
        ) : props.isClustering ? (
          <>
            Clustering... (4/4)
            <LoaderCircleIcon class='animate-spin' />
          </>
        ) : (
          <>
            Cluster with current text
            <ArrowRightIcon />
          </>
        )}
      </Button>
    </form>
  );
}
