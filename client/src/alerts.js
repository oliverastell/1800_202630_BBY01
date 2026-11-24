import Swal from "sweetalert2";

const base = Swal.mixin({
  heightAuto: false,
  reverseButtons: true,
  focusCancel: true,
  confirmButtonColor: "#0d6efd",
  cancelButtonColor: "#6c757d"
});

export async function confirmAction({ title, text, confirmText = "Yes", danger = false }) {
  const result = await base.fire({
    icon: danger ? "warning" : "question",
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    confirmButtonColor: danger ? "#dc3545" : "#0d6efd"
  });
  return result.isConfirmed;
}

export async function promptRename({ title, currentName, save }) {
  const result = await base.fire({
    title,
    input: "text",
    inputValue: currentName,
    inputLabel: "Name",
    inputAttributes: { maxlength: "80", "aria-label": "Bookmark name" },
    showCancelButton: true,
    focusCancel: false,
    confirmButtonText: "Save",
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    inputValidator: value => value.trim() ? null : "Enter a name for this bookmark.",
    preConfirm: async value => {
      try {
        return await save(value.trim());
      } catch (error) {
        Swal.showValidationMessage("Could not save the name. Please try again.");
        return false;
      }
    }
  });
  return result.isConfirmed ? result.value : null;
}

export function showError(text) {
  return base.fire({ icon: "error", title: "Something went wrong", text });
}
