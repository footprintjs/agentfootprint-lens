# Time reply finish stage

The stage adapter owns only its step in the time-reply chart. Shared pure
projection/selection functions know nothing about scope. Raw request and answer
values remain in transient ports; the chart records safe flags/disposition.
Adjacent tests pin this stage's boundary.
