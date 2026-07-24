# Promo Handwritten Homework Script

Use this page as the source for the handwritten photo-recognition demo. Write it by hand on clean white paper, then take a clear phone photo during the student demo.

Student: Alice Chen

Class: Grade 10 Advanced Algebra

## What To Handwrite

```text
Alice Chen
Determinant warm-up

A = [ 2  1 ]
    [ 5  3 ]

det(A) = 2 x 3 - 1 x 5
       = 6 - 5
       = -1

So A is not invertible.
```

## Intentional Error

The final arithmetic is intentionally wrong:

```text
6 - 5 = -1
```

The correct value is:

```text
6 - 5 = 1
```

Because the determinant is `1`, the matrix is invertible.

## Why This Works Well In The Video

- The setup is correct, so OCR should recognize useful mathematical work.
- The final arithmetic has a clear mistake, so the platform can show correction value.
- The problem is short enough for a clean camera shot.
- It connects naturally to the formal-verification and auto-grading message: the platform should not merely transcribe handwriting; it should help detect mathematical errors.

## Recording Tips

- Write large enough that each line is readable on camera.
- Keep the page flat and well lit.
- Photograph only the handwritten math region.
- After OCR fills the steps, pause briefly on the recognized LaTeX before submitting.
- When the platform flags the mistake, zoom in on the feedback.
