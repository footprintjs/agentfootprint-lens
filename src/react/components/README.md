# components/ — Lens UI pieces

`DoorRefusalCard.tsx` renders the door's name and three supplied sentences in
order: what the lens reads, what it received, and where to go. Its adjacent
test checks that rendered output. Recording recognition and refusal facts
belong to `../../core/recordingInput.ts`; the mount component supplies them.
